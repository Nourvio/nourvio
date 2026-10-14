import type {
  AddPairingsInput,
  PairOption,
  Pairing,
  RecipePairings,
} from "@mise/shared"
import { and, asc, eq, inArray, ne, or, sql } from "drizzle-orm"
import { z } from "zod"

import type { Db } from "../db/client.ts"
import { recipePairings, recipes, recipeTags, tags } from "../db/schema.ts"
import { HttpError } from "../http.ts"
import { imageUrls } from "./images.ts"
import { findRecipeRow } from "./recipes.ts"

type RecipeRow = typeof recipes.$inferSelect

const toOption = (row: RecipeRow): PairOption => ({
  id: row.id,
  slug: row.slug,
  name: row.name,
  thumbnailUrl: imageUrls(row.image).thumbnailUrl,
  servings: row.servings,
  totalMinutes: row.totalMinutes,
})

/** The household's recipes with any of these tags (ignoring case). */
async function recipesTagged(db: Db, householdId: string, names: string[]) {
  if (!names.length) return []
  const rows = await db
    .selectDistinct({ recipe: recipes })
    .from(recipes)
    .innerJoin(recipeTags, eq(recipeTags.recipeId, recipes.id))
    .innerJoin(tags, eq(tags.id, recipeTags.tagId))
    .where(
      and(
        eq(recipes.householdId, householdId),
        inArray(
          sql`lower(${tags.name})`,
          names.map((n) => n.toLowerCase())
        )
      )
    )
  return rows.map((r) => r.recipe)
}

/**
 * What a recipe goes with: its rules, every recipe they add up to (picked
 * ones first, then tagged ones by name), and the recipes it's offered with.
 */
export async function getPairings(
  db: Db,
  householdId: string,
  idOrSlug: string
): Promise<RecipePairings> {
  const base = await findRecipeRow(db, householdId, idOrSlug)
  const rules = await db
    .select({ pairing: recipePairings, paired: recipes })
    .from(recipePairings)
    .leftJoin(recipes, eq(recipes.id, recipePairings.pairedRecipeId))
    .where(eq(recipePairings.recipeId, base.id))
    .orderBy(asc(recipePairings.createdAt))

  const pairings: Pairing[] = rules.map(({ pairing, paired }) =>
    paired
      ? { id: pairing.id, kind: "recipe", recipe: toOption(paired) }
      : { id: pairing.id, kind: "tag", tag: pairing.tag! }
  )
  const picked = rules.flatMap((r) => (r.paired ? [r.paired] : []))
  const tagged = (
    await recipesTagged(
      db,
      householdId,
      rules.flatMap((r) => (r.pairing.tag ? [r.pairing.tag] : []))
    )
  ).sort((a, b) => a.name.localeCompare(b.name))
  const seen = new Set<string>([base.id])
  const options = [...picked, ...tagged].flatMap((row) => {
    if (seen.has(row.id)) return []
    seen.add(row.id)
    return [toOption(row)]
  })

  // The other way round: recipes that list this one, or one of its tags.
  const ownTags = (
    await db
      .select({ name: tags.name })
      .from(recipeTags)
      .innerJoin(tags, eq(tags.id, recipeTags.tagId))
      .where(eq(recipeTags.recipeId, base.id))
  ).map((t) => t.name.toLowerCase())
  const offeredWith = await db
    .selectDistinct({ recipe: recipes })
    .from(recipePairings)
    .innerJoin(recipes, eq(recipes.id, recipePairings.recipeId))
    .where(
      and(
        eq(recipePairings.householdId, householdId),
        ne(recipePairings.recipeId, base.id),
        or(
          eq(recipePairings.pairedRecipeId, base.id),
          ownTags.length
            ? inArray(sql`lower(${recipePairings.tag})`, ownTags)
            : sql`false`
        )
      )
    )
  const pairsWith = offeredWith
    .map((r) => toOption(r.recipe))
    .sort((a, b) => a.name.localeCompare(b.name))

  return { pairings, options, pairsWith }
}

/** Adds recipes, or a whole tag, to what a recipe goes with. */
export async function addPairings(
  db: Db,
  householdId: string,
  idOrSlug: string,
  input: AddPairingsInput
) {
  const base = await findRecipeRow(db, householdId, idOrSlug)
  for (const id of input.recipes ?? []) {
    const paired = await findRecipeRow(db, householdId, id)
    if (paired.id === base.id) continue
    await db
      .insert(recipePairings)
      .values({ householdId, recipeId: base.id, pairedRecipeId: paired.id })
      .onConflictDoNothing()
  }
  if (input.tag) {
    const [tag] = await db
      .select({ name: tags.name })
      .from(tags)
      .where(
        and(
          eq(tags.householdId, householdId),
          eq(sql`lower(${tags.name})`, input.tag.toLowerCase())
        )
      )
    if (!tag) throw new HttpError(400, "There's no tag by that name")
    await db
      .insert(recipePairings)
      .values({ householdId, recipeId: base.id, tag: tag.name })
      .onConflictDoNothing()
  }
  return getPairings(db, householdId, base.id)
}

export async function removePairing(
  db: Db,
  householdId: string,
  idOrSlug: string,
  pairingId: string
) {
  const base = await findRecipeRow(db, householdId, idOrSlug)
  const removed = z.uuid().safeParse(pairingId).success
    ? await db
        .delete(recipePairings)
        .where(
          and(
            eq(recipePairings.id, pairingId),
            eq(recipePairings.recipeId, base.id)
          )
        )
        .returning({ id: recipePairings.id })
    : []
  if (!removed.length) throw new HttpError(404, "That pairing isn't there")
  return getPairings(db, householdId, base.id)
}

/**
 * Every recipe's pairing options in the household, by recipe id, for
 * suggesting meals: picked recipes and tagged ones.
 */
export async function pairingOptionsByRecipe(db: Db, householdId: string) {
  const rules = await db
    .select()
    .from(recipePairings)
    .where(eq(recipePairings.householdId, householdId))
  const tagNames = [
    ...new Set(rules.flatMap((r) => (r.tag ? [r.tag.toLowerCase()] : []))),
  ]
  const tagged = tagNames.length
    ? await db
        .select({
          recipeId: recipeTags.recipeId,
          tag: sql<string>`lower(${tags.name})`,
        })
        .from(recipeTags)
        .innerJoin(tags, eq(tags.id, recipeTags.tagId))
        .where(
          and(
            eq(tags.householdId, householdId),
            inArray(sql`lower(${tags.name})`, tagNames)
          )
        )
    : []
  const byTag = new Map<string, string[]>()
  for (const row of tagged) {
    byTag.set(row.tag, [...(byTag.get(row.tag) ?? []), row.recipeId])
  }
  const options = new Map<string, Set<string>>()
  for (const rule of rules) {
    const found = options.get(rule.recipeId) ?? new Set<string>()
    const ids = rule.pairedRecipeId
      ? [rule.pairedRecipeId]
      : (byTag.get(rule.tag!.toLowerCase()) ?? [])
    for (const id of ids) if (id !== rule.recipeId) found.add(id)
    options.set(rule.recipeId, found)
  }
  return options
}
