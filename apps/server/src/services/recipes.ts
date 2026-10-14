import {
  joinSections,
  parseIngredient,
  recipeInput,
  splitSections,
  type Recipe,
  type RecipeInput,
  type RecipeInputParsed,
  type RecipeOrigin,
  type RecipeSummary,
  type RecipeVersion,
  type Tag,
} from "@mise/shared"
import {
  and,
  asc,
  count,
  desc,
  eq,
  exists,
  ilike,
  inArray,
  like,
  or,
  sql,
} from "drizzle-orm"
import { z } from "zod"

import type { Db } from "../db/client.ts"
import {
  recipeIngredients,
  recipes,
  recipeSteps,
  recipeTags,
  recipeVersions,
  tags,
} from "../db/schema.ts"
import { HttpError } from "../http.ts"
import { deleteImage, imageUrls } from "./images.ts"

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0]
type RecipeRow = typeof recipes.$inferSelect

const uuidSchema = z.uuid()

export function slugify(name: string) {
  return (
    name
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/&/g, " and ")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60)
      .replace(/-+$/, "") || "recipe"
  )
}

async function uniqueSlug(tx: Db | Tx, name: string, excludeId?: string) {
  const base = slugify(name)
  const taken = await tx
    .select({ slug: recipes.slug, id: recipes.id })
    .from(recipes)
    .where(or(eq(recipes.slug, base), like(recipes.slug, `${base}-%`)))
  const used = new Set(
    taken.filter((row) => row.id !== excludeId).map((row) => row.slug)
  )
  if (!used.has(base)) return base
  for (let n = 2; ; n++) {
    if (!used.has(`${base}-${n}`)) return `${base}-${n}`
  }
}

function columnsFrom(data: RecipeInputParsed) {
  return {
    name: data.name,
    description: data.description ?? null,
    servings: data.servings ?? null,
    yieldText: data.yieldText ?? null,
    prepMinutes: data.prepMinutes ?? null,
    cookMinutes: data.cookMinutes ?? null,
    totalMinutes: data.totalMinutes ?? null,
    notes: data.notes ?? null,
    sourceUrl: data.sourceUrl ?? null,
    rating: data.rating ?? null,
    nutrition: data.nutrition ?? null,
  }
}

/** Replaces a recipe's ingredients, steps and tags with the ones in `data`. */
async function writeContent(tx: Tx, recipeId: string, data: RecipeInputParsed) {
  await tx
    .delete(recipeIngredients)
    .where(eq(recipeIngredients.recipeId, recipeId))
  await tx.delete(recipeSteps).where(eq(recipeSteps.recipeId, recipeId))
  await tx.delete(recipeTags).where(eq(recipeTags.recipeId, recipeId))

  const ingredients = splitSections(data.ingredients, { colonHeadings: true })
  if (ingredients.length) {
    await tx.insert(recipeIngredients).values(
      ingredients.map((item, position) => {
        const parsed = parseIngredient(item.text)
        return {
          recipeId,
          position,
          section: item.section,
          rawText: parsed.text,
          quantity: parsed.quantity,
          quantityMax: parsed.quantityMax,
          unitId: parsed.unitId,
          food: parsed.food,
          note: parsed.note,
        }
      })
    )
  }

  const steps = splitSections(data.steps)
  if (steps.length) {
    await tx.insert(recipeSteps).values(
      steps.map((item, position) => ({
        recipeId,
        position,
        section: item.section,
        text: item.text,
      }))
    )
  }

  // One of each tag, case-insensitively, keeping the first spelling given.
  const unique = new Map<string, string>()
  for (const tag of data.tags) {
    if (!unique.has(tag.toLowerCase())) unique.set(tag.toLowerCase(), tag)
  }
  const names = [...unique.values()]
  if (names.length) {
    const existing = await tx
      .select()
      .from(tags)
      .where(
        inArray(
          sql`lower(${tags.name})`,
          names.map((n) => n.toLowerCase())
        )
      )
    const byName = new Map(existing.map((t) => [t.name.toLowerCase(), t.id]))
    for (const name of names) {
      if (!byName.has(name.toLowerCase())) {
        const [created] = await tx.insert(tags).values({ name }).returning()
        byName.set(name.toLowerCase(), created!.id)
      }
    }
    await tx.insert(recipeTags).values(
      names.map((name) => ({
        recipeId,
        tagId: byName.get(name.toLowerCase())!,
      }))
    )
  }
}

/** The recipe as editor input, which is also what a version stores. */
export function toInput(recipe: Recipe): RecipeInput {
  return {
    name: recipe.name,
    description: recipe.description,
    servings: recipe.servings,
    yieldText: recipe.yieldText,
    prepMinutes: recipe.prepMinutes,
    cookMinutes: recipe.cookMinutes,
    totalMinutes: recipe.totalMinutes,
    notes: recipe.notes,
    sourceUrl: recipe.sourceUrl,
    rating: recipe.rating,
    tags: recipe.tags,
    ingredients: joinSections(
      recipe.ingredients.map((i) => ({ section: i.section, text: i.text }))
    ),
    steps: joinSections(recipe.steps),
    nutrition: recipe.nutrition,
  }
}

async function tagsFor(db: Db | Tx, recipeIds: string[]) {
  const result = new Map<string, string[]>()
  if (!recipeIds.length) return result
  const rows = await db
    .select({ recipeId: recipeTags.recipeId, name: tags.name })
    .from(recipeTags)
    .innerJoin(tags, eq(recipeTags.tagId, tags.id))
    .where(inArray(recipeTags.recipeId, recipeIds))
    .orderBy(asc(tags.name))
  for (const row of rows) {
    result.set(row.recipeId, [...(result.get(row.recipeId) ?? []), row.name])
  }
  return result
}

function toSummary(row: RecipeRow, tagNames: string[]): RecipeSummary {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    ...imageUrls(row.image),
    totalMinutes: row.totalMinutes,
    servings: row.servings,
    rating: row.rating,
    tags: tagNames,
    lastMadeAt: row.lastMadeAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  }
}

export async function findRecipeRow(db: Db | Tx, idOrSlug: string) {
  const where = uuidSchema.safeParse(idOrSlug).success
    ? eq(recipes.id, idOrSlug)
    : eq(recipes.slug, idOrSlug)
  const [row] = await db.select().from(recipes).where(where).limit(1)
  if (!row) throw new HttpError(404, "That recipe doesn't exist")
  return row
}

export async function getRecipe(
  db: Db | Tx,
  idOrSlug: string
): Promise<Recipe> {
  const row = await findRecipeRow(db, idOrSlug)
  const [ingredients, steps, tagMap] = await Promise.all([
    db
      .select()
      .from(recipeIngredients)
      .where(eq(recipeIngredients.recipeId, row.id))
      .orderBy(asc(recipeIngredients.position)),
    db
      .select()
      .from(recipeSteps)
      .where(eq(recipeSteps.recipeId, row.id))
      .orderBy(asc(recipeSteps.position)),
    tagsFor(db, [row.id]),
  ])
  return {
    ...toSummary(row, tagMap.get(row.id) ?? []),
    origin: row.origin,
    sourceUrl: row.sourceUrl,
    yieldText: row.yieldText,
    prepMinutes: row.prepMinutes,
    cookMinutes: row.cookMinutes,
    notes: row.notes,
    nutrition: row.nutrition,
    updatedAt: row.updatedAt.toISOString(),
    ingredients: ingredients.map((i) => ({
      id: i.id,
      section: i.section,
      text: i.rawText,
      quantity: i.quantity,
      quantityMax: i.quantityMax,
      unitId: i.unitId,
      food: i.food,
      note: i.note,
    })),
    steps: steps.map((s) => ({ id: s.id, section: s.section, text: s.text })),
  }
}

export async function listRecipes(
  db: Db,
  { q, tag }: { q?: string; tag?: string } = {}
) {
  const conditions = []
  if (q?.trim()) {
    const pattern = `%${q.trim().replace(/[\\%_]/g, (c) => `\\${c}`)}%`
    conditions.push(
      or(
        ilike(recipes.name, pattern),
        ilike(recipes.description, pattern),
        exists(
          db
            .select({ one: sql`1` })
            .from(recipeIngredients)
            .where(
              and(
                eq(recipeIngredients.recipeId, recipes.id),
                ilike(recipeIngredients.rawText, pattern)
              )
            )
        ),
        exists(
          db
            .select({ one: sql`1` })
            .from(recipeTags)
            .innerJoin(tags, eq(recipeTags.tagId, tags.id))
            .where(
              and(
                eq(recipeTags.recipeId, recipes.id),
                ilike(tags.name, pattern)
              )
            )
        )
      )
    )
  }
  if (tag?.trim()) {
    conditions.push(
      exists(
        db
          .select({ one: sql`1` })
          .from(recipeTags)
          .innerJoin(tags, eq(recipeTags.tagId, tags.id))
          .where(
            and(
              eq(recipeTags.recipeId, recipes.id),
              eq(sql`lower(${tags.name})`, tag.trim().toLowerCase())
            )
          )
      )
    )
  }
  const rows = await db
    .select()
    .from(recipes)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(recipes.createdAt))
  const tagMap = await tagsFor(
    db,
    rows.map((r) => r.id)
  )
  return rows.map((row) => toSummary(row, tagMap.get(row.id) ?? []))
}

export async function listTags(db: Db): Promise<Tag[]> {
  const rows = await db
    .select({ name: tags.name, count: count(recipeTags.recipeId) })
    .from(tags)
    .innerJoin(recipeTags, eq(recipeTags.tagId, tags.id))
    .groupBy(tags.id, tags.name)
    .orderBy(desc(count(recipeTags.recipeId)), asc(tags.name))
  return rows
}

export async function createRecipe(
  db: Db,
  input: RecipeInput,
  options: {
    origin: RecipeOrigin
    userId: string | null
    image?: string | null
    externalRef?: string | null
    lastMadeAt?: Date | null
  }
) {
  const data = recipeInput.parse(input)
  const id = await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(recipes)
      .values({
        ...columnsFrom(data),
        slug: await uniqueSlug(tx, data.name),
        origin: options.origin,
        image: options.image ?? null,
        externalRef: options.externalRef ?? null,
        lastMadeAt: options.lastMadeAt ?? null,
        createdBy: options.userId,
      })
      .returning({ id: recipes.id })
    await writeContent(tx, row!.id, data)
    return row!.id
  })
  const recipe = await getRecipe(db, id)
  await db.insert(recipeVersions).values({
    recipeId: id,
    snapshot: toInput(recipe),
    source: "create",
    createdBy: options.userId,
  })
  return recipe
}

export async function updateRecipe(
  db: Db,
  idOrSlug: string,
  input: RecipeInput,
  options: { userId: string | null; source?: RecipeVersion["source"] }
) {
  const data = recipeInput.parse(input)
  const current = await findRecipeRow(db, idOrSlug)
  await db.transaction(async (tx) => {
    await tx
      .update(recipes)
      .set({
        ...columnsFrom(data),
        slug:
          data.name === current.name
            ? current.slug
            : await uniqueSlug(tx, data.name, current.id),
      })
      .where(eq(recipes.id, current.id))
    await writeContent(tx, current.id, data)
  })
  const recipe = await getRecipe(db, current.id)
  await db.insert(recipeVersions).values({
    recipeId: current.id,
    snapshot: toInput(recipe),
    source: options.source ?? "edit",
    createdBy: options.userId,
  })
  return recipe
}

export async function deleteRecipe(db: Db, idOrSlug: string) {
  const row = await findRecipeRow(db, idOrSlug)
  await db.delete(recipes).where(eq(recipes.id, row.id))
  await deleteImage(row.image)
}

export async function setRecipeFields(
  db: Db,
  idOrSlug: string,
  fields: Partial<Pick<RecipeRow, "rating" | "lastMadeAt" | "image">>
) {
  const row = await findRecipeRow(db, idOrSlug)
  await db.update(recipes).set(fields).where(eq(recipes.id, row.id))
  return getRecipe(db, row.id)
}

export async function listVersions(db: Db, idOrSlug: string) {
  const row = await findRecipeRow(db, idOrSlug)
  const versions = await db
    .select()
    .from(recipeVersions)
    .where(eq(recipeVersions.recipeId, row.id))
    .orderBy(desc(recipeVersions.createdAt))
  return versions.map((v): RecipeVersion => ({
    id: v.id,
    source: v.source,
    createdAt: v.createdAt.toISOString(),
    createdBy: v.createdBy,
    name: v.snapshot.name,
  }))
}

export async function restoreVersion(
  db: Db,
  idOrSlug: string,
  versionId: string,
  userId: string | null
) {
  const row = await findRecipeRow(db, idOrSlug)
  const [version] = uuidSchema.safeParse(versionId).success
    ? await db
        .select()
        .from(recipeVersions)
        .where(
          and(
            eq(recipeVersions.id, versionId),
            eq(recipeVersions.recipeId, row.id)
          )
        )
    : []
  if (!version) throw new HttpError(404, "That version doesn't exist")
  return updateRecipe(db, row.id, version.snapshot, {
    userId,
    source: "restore",
  })
}
