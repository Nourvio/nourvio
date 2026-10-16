import { joinSections, parseIngredient, splitSections } from "@merran/shared"
import type { FilterQuery } from "@mikro-orm/core"
import type { EntityManager } from "@mikro-orm/sql"
import {
  Recipe,
  RecipeIngredient,
  RecipeStep,
  RecipeTag,
  Tag,
  type RECIPE_ORIGINS,
} from "../../database/entities/index.ts"
import { HOUSEHOLD_FILTER } from "../../database/scope.ts"
import type { FileStore } from "../storage/files.ts"
import { containing } from "../../database/text.ts"
import { AppError } from "../../core/errors.ts"
import type { RecipeInput } from "../../http/schemas/recipes.ts"
import { photoUrls, removePhoto, storePhoto } from "./photos.ts"
import { uniqueSlug } from "./slugs.ts"
import { pruneTags, setTags, tagKey, tagsOf } from "./tags.ts"
import { saveVersion, type VersionSource } from "./versions.ts"

export type RecipeOrigin = (typeof RECIPE_ORIGINS)[number]

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Runs `work` in a transaction that sees only one household's rows. It
 * starts from a fresh fork, so what it loads isn't shared with whatever
 * the caller already loaded.
 */
export function inHouseholdTransaction<T>(
  em: EntityManager,
  householdId: string,
  work: (tx: EntityManager) => Promise<T>
): Promise<T> {
  return em.fork().transactional((tx) => {
    tx.setFilterParams(HOUSEHOLD_FILTER, { householdId })
    return work(tx)
  })
}

/** A recipe by its id or slug, with its lines. Not one in Recently deleted. */
export async function findRecipe(em: EntityManager, idOrSlug: string) {
  const recipe = await em.findOne(
    Recipe,
    UUID.test(idOrSlug) ? { id: idOrSlug } : { slug: idOrSlug },
    { populate: ["ingredients", "steps"] }
  )
  if (!recipe) {
    throw new AppError(
      "not_found",
      "recipe_not_found",
      "There's no such recipe."
    )
  }
  return recipe
}

/** A double column, which the database driver may hand back as text. */
const toNumber = (value: string | number | null | undefined) =>
  value == null ? null : Number(value)

/** Total time as given, or prep and cook added up. */
function totalMinutes(recipe: Recipe) {
  if (recipe.totalMinutes != null) return recipe.totalMinutes
  if (recipe.prepMinutes == null && recipe.cookMinutes == null) return null
  return (recipe.prepMinutes ?? 0) + (recipe.cookMinutes ?? 0)
}

export function summarize(recipe: Recipe, tags: string[]) {
  return {
    id: recipe.id,
    slug: recipe.slug,
    name: recipe.name,
    description: recipe.description ?? null,
    servings: toNumber(recipe.servings),
    totalMinutes: totalMinutes(recipe),
    rating: recipe.rating ?? null,
    tags,
    photo: photoUrls(recipe),
    lastMadeAt: recipe.lastMadeAt?.toISOString() ?? null,
    createdAt: recipe.createdAt.toISOString(),
    updatedAt: recipe.updatedAt.toISOString(),
  }
}

/** A recipe with everything in it, its lines loaded. */
export function describeRecipe(recipe: Recipe, tags: string[]) {
  return {
    ...summarize(recipe, tags),
    origin: recipe.origin,
    sourceUrl: recipe.sourceUrl ?? null,
    yieldText: recipe.yieldText ?? null,
    prepMinutes: recipe.prepMinutes ?? null,
    cookMinutes: recipe.cookMinutes ?? null,
    notes: recipe.notes ?? null,
    ingredients: recipe.ingredients.getItems().map((line) => ({
      id: line.id,
      section: line.section ?? null,
      text: line.rawText,
      quantity: toNumber(line.quantity),
      quantityMax: toNumber(line.quantityMax),
      unit: line.unit ?? null,
      food: line.food ?? null,
      note: line.note ?? null,
    })),
    steps: recipe.steps.getItems().map((step) => ({
      id: step.id,
      section: step.section ?? null,
      text: step.text,
    })),
  }
}

export async function loadRecipe(em: EntityManager, idOrSlug: string) {
  const recipe = await findRecipe(em, idOrSlug)
  const tags = await tagsOf(em, [recipe.id])
  return describeRecipe(recipe, tags.get(recipe.id) ?? [])
}

/** A recipe as editor lines, for a version or to edit. */
export function snapshotOf(recipe: Recipe, tags: string[]): RecipeInput {
  return {
    name: recipe.name,
    description: recipe.description ?? null,
    servings: toNumber(recipe.servings),
    yieldText: recipe.yieldText ?? null,
    prepMinutes: recipe.prepMinutes ?? null,
    cookMinutes: recipe.cookMinutes ?? null,
    totalMinutes: recipe.totalMinutes ?? null,
    notes: recipe.notes ?? null,
    sourceUrl: recipe.sourceUrl ?? null,
    rating: recipe.rating ?? null,
    tags,
    ingredients: joinSections(
      recipe.ingredients
        .getItems()
        .map((line) => ({ section: line.section ?? null, text: line.rawText }))
    ),
    steps: joinSections(
      recipe.steps
        .getItems()
        .map((step) => ({ section: step.section ?? null, text: step.text }))
    ),
  }
}

/** Sets a recipe to what the input says, lines and tags included. */
async function fill(
  tx: EntityManager,
  householdId: string,
  recipe: Recipe,
  input: RecipeInput
) {
  recipe.name = input.name
  recipe.description = input.description
  recipe.servings = input.servings
  recipe.yieldText = input.yieldText
  recipe.prepMinutes = input.prepMinutes
  recipe.cookMinutes = input.cookMinutes
  recipe.totalMinutes = input.totalMinutes
  recipe.notes = input.notes
  recipe.sourceUrl = input.sourceUrl
  recipe.rating = input.rating

  recipe.ingredients.set(
    splitSections(input.ingredients).map((item, position) => {
      const parsed = parseIngredient(item.text)
      return tx.create(RecipeIngredient, {
        household: householdId,
        recipe,
        position,
        section: item.section,
        rawText: parsed.text,
        quantity: parsed.quantity,
        quantityMax: parsed.quantityMax,
        unit: parsed.unitId,
        food: parsed.food,
        note: parsed.note,
      })
    })
  )
  recipe.steps.set(
    splitSections(input.steps).map((item, position) =>
      tx.create(RecipeStep, {
        household: householdId,
        recipe,
        position,
        section: item.section,
        text: item.text,
      })
    )
  )
  await setTags(tx, householdId, recipe, input.tags)
  await tx.flush()
}

export async function createRecipe(
  em: EntityManager,
  options: {
    householdId: string
    userId: string | null
    input: RecipeInput
    origin?: RecipeOrigin
    /** A photo already stored for it (see photos.ts). */
    photoId?: string | null
  }
) {
  const id = await inHouseholdTransaction(
    em,
    options.householdId,
    async (tx) => {
      const recipe = tx.create(Recipe, {
        household: options.householdId,
        slug: await uniqueSlug(tx, options.input.name),
        name: options.input.name,
        origin: options.origin ?? "manual",
        image: options.photoId ?? null,
        createdBy: options.userId,
      })
      await fill(tx, options.householdId, recipe, options.input)
      return recipe.id
    }
  )
  return loadRecipe(em.fork(), id)
}

/**
 * Replaces a recipe with the input, keeping a version of how it was. Its
 * slug stays, so links to it keep working.
 */
export async function updateRecipe(
  em: EntityManager,
  options: {
    householdId: string
    userId: string | null
    recipe: string
    input: RecipeInput
    source?: VersionSource
  }
) {
  const id = await inHouseholdTransaction(
    em,
    options.householdId,
    async (tx) => {
      const recipe = await findRecipe(tx, options.recipe)
      const tags = (await tagsOf(tx, [recipe.id])).get(recipe.id) ?? []
      await saveVersion(tx, {
        householdId: options.householdId,
        recipe,
        snapshot: snapshotOf(recipe, tags),
        source: options.source ?? "edit",
        userId: options.userId,
      })
      await fill(tx, options.householdId, recipe, options.input)
      await pruneTags(tx)
      return recipe.id
    }
  )
  return loadRecipe(em.fork(), id)
}

export type RecipeListOptions = {
  q?: string | undefined
  tag: string[]
  sort: "newest" | "name" | "updated" | "rating"
  limit: number
  offset: number
}

// Ties go newest first, by id (ids are made in time order).
const ORDER = {
  newest: { createdAt: "desc", id: "desc" },
  name: { name: "asc", id: "desc" },
  updated: { updatedAt: "desc", id: "desc" },
  rating: { rating: "desc nulls last", name: "asc", id: "desc" },
} as const

/** Recipes matching a search and tags, a page at a time. */
export async function listRecipes(
  em: EntityManager,
  { q, tag, sort, limit, offset }: RecipeListOptions
) {
  const where: FilterQuery<Recipe> = {}
  const and: FilterQuery<Recipe>[] = []

  const words = q?.trim()
  if (words) {
    const like = containing(em, words)
    const inIngredients = await em.find(
      RecipeIngredient,
      { rawText: like },
      { fields: ["recipe"] }
    )
    and.push({
      $or: [
        { name: like },
        { description: like },
        {
          id: {
            $in: [...new Set(inIngredients.map((line) => line.recipe.id))],
          },
        },
      ],
    })
  }

  const keys = [...new Set(tag.map(tagKey).filter(Boolean))]
  if (keys.length > 0) {
    const tags = await em.find(Tag, { nameKey: { $in: keys } })
    if (tags.length < keys.length) return { recipes: [], total: 0 }
    const rows = await em.find(
      RecipeTag,
      { tag: { $in: tags.map((t) => t.id) } },
      { fields: ["recipe", "tag"] }
    )
    const counts = new Map<string, number>()
    for (const row of rows) {
      counts.set(row.recipe.id, (counts.get(row.recipe.id) ?? 0) + 1)
    }
    and.push({
      id: {
        $in: [...counts].flatMap(([id, n]) => (n === keys.length ? [id] : [])),
      },
    })
  }
  if (and.length > 0) where.$and = and

  const [recipes, total] = await em.findAndCount(Recipe, where, {
    orderBy: ORDER[sort],
    limit,
    offset,
  })
  const tags = await tagsOf(
    em,
    recipes.map((recipe) => recipe.id)
  )
  return {
    recipes: recipes.map((recipe) =>
      summarize(recipe, tags.get(recipe.id) ?? [])
    ),
    total,
  }
}

/** Moves a recipe to Recently deleted. */
export async function moveToDeleted(em: EntityManager, idOrSlug: string) {
  const recipe = await em.findOne(
    Recipe,
    UUID.test(idOrSlug) ? { id: idOrSlug } : { slug: idOrSlug }
  )
  if (!recipe) {
    throw new AppError(
      "not_found",
      "recipe_not_found",
      "There's no such recipe."
    )
  }
  recipe.deletedAt = new Date()
  await em.flush()
}

/** Gives a recipe a new photo, in place of any it had. */
export async function setPhoto(
  em: EntityManager,
  files: FileStore,
  options: { householdId: string; recipe: string; photo: Buffer }
) {
  const recipe = await findRecipe(em, options.recipe)
  const photoId = await storePhoto(files, options.householdId, options.photo)
  const old = recipe.image
  recipe.image = photoId
  recipe.imageByAi = false
  await em.flush()
  await removePhoto(files, options.householdId, old)
  return loadRecipe(em, recipe.id)
}

/** Takes a recipe's photo away, and deletes it. */
export async function clearPhoto(
  em: EntityManager,
  files: FileStore,
  options: { householdId: string; recipe: string }
) {
  const recipe = await findRecipe(em, options.recipe)
  const old = recipe.image
  recipe.image = null
  recipe.imageByAi = false
  await em.flush()
  await removePhoto(files, options.householdId, old)
  return loadRecipe(em, recipe.id)
}

/** "I made this": the recipe was made now. Not an edit, so no version is kept. */
export async function markMade(em: EntityManager, options: { recipe: string }) {
  const recipe = await findRecipe(em, options.recipe)
  recipe.lastMadeAt = new Date()
  await em.flush()
  return loadRecipe(em, recipe.id)
}

/** Rates a recipe, or clears its rating. Not an edit, so no version is kept. */
export async function setRating(
  em: EntityManager,
  options: { recipe: string; rating: number | null }
) {
  const recipe = await findRecipe(em, options.recipe)
  recipe.rating = options.rating
  await em.flush()
  return loadRecipe(em, recipe.id)
}
