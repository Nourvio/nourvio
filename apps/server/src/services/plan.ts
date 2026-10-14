import {
  daysBetween,
  type AddPlanEntryInput,
  type PlanEntry,
  type UpdatePlanEntryInput,
} from "@mise/shared"
import { and, asc, eq, gte, lte, max } from "drizzle-orm"
import { z } from "zod"

import type { Db } from "../db/client.ts"
import { mealPlanEntries, recipes } from "../db/schema.ts"
import { HttpError } from "../http.ts"
import { findRecipeRow, getRecipe } from "./recipes.ts"
import { imageUrls } from "./images.ts"

type EntryRow = typeof mealPlanEntries.$inferSelect

const columns = {
  entry: mealPlanEntries,
  recipe: {
    id: recipes.id,
    slug: recipes.slug,
    name: recipes.name,
    image: recipes.image,
    totalMinutes: recipes.totalMinutes,
    servings: recipes.servings,
  },
}

type Joined = {
  entry: EntryRow
  recipe: {
    id: string
    slug: string
    name: string
    image: string | null
    totalMinutes: number | null
    servings: number | null
  } | null
}

function toEntry({ entry, recipe }: Joined): PlanEntry {
  return {
    id: entry.id,
    date: entry.date,
    meal: entry.meal,
    position: entry.position,
    recipe: recipe
      ? {
          id: recipe.id,
          slug: recipe.slug,
          name: recipe.name,
          thumbnailUrl: imageUrls(recipe.image).thumbnailUrl,
          totalMinutes: recipe.totalMinutes,
          servings: recipe.servings,
        }
      : null,
    note: entry.note,
    servings: entry.servings,
    status: entry.status,
    listed: entry.listedAt !== null,
  }
}

function select(db: Db) {
  return db
    .select(columns)
    .from(mealPlanEntries)
    .leftJoin(recipes, eq(mealPlanEntries.recipeId, recipes.id))
}

/** Plan entries from one date to another (both included), in order. */
export async function listEntries(
  db: Db,
  householdId: string,
  from: string,
  to: string
) {
  if (daysBetween(from, to) < 0 || daysBetween(from, to) > 62) {
    throw new HttpError(400, "Ask for up to two months at a time")
  }
  const rows = await select(db)
    .where(
      and(
        eq(mealPlanEntries.householdId, householdId),
        gte(mealPlanEntries.date, from),
        lte(mealPlanEntries.date, to)
      )
    )
    .orderBy(
      asc(mealPlanEntries.date),
      asc(mealPlanEntries.position),
      asc(mealPlanEntries.createdAt)
    )
  return rows.map(toEntry)
}

async function findEntry(db: Db, householdId: string, id: string) {
  const [row] = z.uuid().safeParse(id).success
    ? await db
        .select()
        .from(mealPlanEntries)
        .where(
          and(
            eq(mealPlanEntries.id, id),
            eq(mealPlanEntries.householdId, householdId)
          )
        )
    : []
  if (!row) throw new HttpError(404, "That meal isn't in the plan")
  return row
}

async function getEntry(db: Db, id: string) {
  const [row] = await select(db).where(eq(mealPlanEntries.id, id))
  return toEntry(row!)
}

/** The next position at the end of a meal. */
async function nextPosition(
  db: Db,
  householdId: string,
  date: string,
  meal: string
) {
  const [row] = await db
    .select({ position: max(mealPlanEntries.position) })
    .from(mealPlanEntries)
    .where(
      and(
        eq(mealPlanEntries.householdId, householdId),
        eq(mealPlanEntries.date, date),
        eq(mealPlanEntries.meal, meal as EntryRow["meal"])
      )
    )
  return row?.position === null || row?.position === undefined
    ? 0
    : row.position + 1
}

export async function addEntry(
  db: Db,
  householdId: string,
  input: AddPlanEntryInput,
  userId: string | null
) {
  const recipe = input.recipeId
    ? await findRecipeRow(db, householdId, input.recipeId)
    : null
  const [row] = await db
    .insert(mealPlanEntries)
    .values({
      householdId,
      date: input.date,
      meal: input.meal,
      position: await nextPosition(db, householdId, input.date, input.meal),
      recipeId: recipe?.id ?? null,
      note: recipe ? null : (input.note ?? null),
      servings: input.servings ?? null,
      createdBy: userId,
    })
    .returning({ id: mealPlanEntries.id })
  return getEntry(db, row!.id)
}

export async function updateEntry(
  db: Db,
  householdId: string,
  id: string,
  input: UpdatePlanEntryInput
) {
  const current = await findEntry(db, householdId, id)
  const moved =
    (input.date && input.date !== current.date) ||
    (input.meal && input.meal !== current.meal)
  await db
    .update(mealPlanEntries)
    .set({
      ...(input.date ? { date: input.date } : {}),
      ...(input.meal ? { meal: input.meal } : {}),
      ...(input.servings !== undefined ? { servings: input.servings } : {}),
      ...(input.status ? { status: input.status } : {}),
      ...(input.note && !current.recipeId ? { note: input.note } : {}),
      // Moving to another meal puts it at the end there.
      ...(moved
        ? {
            position: await nextPosition(
              db,
              householdId,
              input.date ?? current.date,
              input.meal ?? current.meal
            ),
          }
        : {}),
    })
    .where(eq(mealPlanEntries.id, current.id))
  // Cooking a planned meal is the same as "I made this".
  if (
    input.status === "cooked" &&
    current.status !== "cooked" &&
    current.recipeId
  ) {
    await db
      .update(recipes)
      .set({ lastMadeAt: new Date() })
      .where(eq(recipes.id, current.recipeId))
  }
  return getEntry(db, current.id)
}

export async function deleteEntry(db: Db, householdId: string, id: string) {
  const current = await findEntry(db, householdId, id)
  await db.delete(mealPlanEntries).where(eq(mealPlanEntries.id, current.id))
}

/**
 * When a recipe is made, its planned entries on that day count as cooked.
 * Returns how many there were.
 */
export async function markPlannedCooked(
  db: Db,
  householdId: string,
  recipeId: string,
  date: string
) {
  const recipe = await getRecipe(db, householdId, recipeId)
  const updated = await db
    .update(mealPlanEntries)
    .set({ status: "cooked" })
    .where(
      and(
        eq(mealPlanEntries.householdId, householdId),
        eq(mealPlanEntries.recipeId, recipe.id),
        eq(mealPlanEntries.date, date),
        eq(mealPlanEntries.status, "planned")
      )
    )
    .returning({ id: mealPlanEntries.id })
  return updated.length
}
