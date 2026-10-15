import {
  addDays,
  daysBetween,
  type AddPlanEntryInput,
  type Nutrition,
  type PlanBulkInput,
  type PlanEntry,
  type UpdatePlanEntryInput,
} from "@mise/shared"
import { and, asc, eq, gte, inArray, isNull, lte, max, or } from "drizzle-orm"
import { alias } from "drizzle-orm/pg-core"
import { z } from "zod"

import type { Db } from "../db/client.ts"
import { mealPlanEntries, recipes } from "../db/schema.ts"
import { HttpError } from "../http.ts"
import { findRecipeRow, getRecipe } from "./recipes.ts"
import { imageUrls } from "./images.ts"
import { restoreForMeal, useForMeal } from "./pantry.ts"

type EntryRow = typeof mealPlanEntries.$inferSelect

/** The recipe it's made with, joined a second time. */
const withRecipes = alias(recipes, "with_recipes")

const columns = {
  entry: mealPlanEntries,
  recipe: {
    id: recipes.id,
    slug: recipes.slug,
    name: recipes.name,
    image: recipes.image,
    totalMinutes: recipes.totalMinutes,
    servings: recipes.servings,
    nutrition: recipes.nutrition,
  },
  paired: {
    id: withRecipes.id,
    slug: withRecipes.slug,
    name: withRecipes.name,
    servings: withRecipes.servings,
    nutrition: withRecipes.nutrition,
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
    nutrition: Nutrition | null
  } | null
  paired: {
    id: string
    slug: string
    name: string
    servings: number | null
    nutrition: Nutrition | null
  } | null
}

const planNutrition = (nutrition: Nutrition | null) =>
  nutrition
    ? {
        calories: nutrition.calories,
        protein: nutrition.protein,
        carbohydrates: nutrition.carbohydrates,
        fat: nutrition.fat,
      }
    : null

function toEntry({ entry, recipe, paired }: Joined): PlanEntry {
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
          nutrition: planNutrition(recipe.nutrition),
        }
      : null,
    with:
      recipe && paired
        ? { ...paired, nutrition: planNutrition(paired.nutrition) }
        : null,
    note: entry.note,
    servings: entry.servings,
    status: entry.status,
    listed: entry.listedAt !== null,
    pantryUsed: (entry.pantryUsed ?? []).map((row) => row.name),
  }
}

function select(db: Db) {
  return db
    .select(columns)
    .from(mealPlanEntries)
    .leftJoin(recipes, eq(mealPlanEntries.recipeId, recipes.id))
    .leftJoin(
      withRecipes,
      and(
        eq(mealPlanEntries.withRecipeId, withRecipes.id),
        isNull(withRecipes.deletedAt)
      )
    )
}

/** Meals with a recipe in Recently deleted are off the plan until it's restored. */
const recipeNotDeleted = or(
  isNull(mealPlanEntries.recipeId),
  isNull(recipes.deletedAt)
)

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
        lte(mealPlanEntries.date, to),
        recipeNotDeleted
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
  const paired =
    recipe && input.withRecipeId
      ? await findRecipeRow(db, householdId, input.withRecipeId)
      : null
  const [row] = await db
    .insert(mealPlanEntries)
    .values({
      withRecipeId: paired?.id ?? null,
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
  const swapped = input.recipeId
    ? await findRecipeRow(db, householdId, input.recipeId)
    : null
  const paired = input.withRecipeId
    ? await findRecipeRow(db, householdId, input.withRecipeId)
    : null
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
      ...(input.withRecipeId !== undefined
        ? { withRecipeId: paired?.id ?? null, listedAt: null }
        : {}),
      // A different recipe isn't on the list yet, and starts at its own
      // servings unless they're given too.
      ...(swapped
        ? {
            recipeId: swapped.id,
            // What went with the old recipe may not go with this one.
            withRecipeId: paired?.id ?? null,
            note: null,
            servings: input.servings ?? null,
            listedAt: null,
            status: "planned" as const,
          }
        : {}),
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
  const status = swapped ? "planned" : (input.status ?? current.status)
  if (current.status === "cooked" && status !== "cooked") {
    // It wasn't cooked after all: put back what it used.
    await restoreForMeal(db, householdId, current.pantryUsed ?? [])
    await db
      .update(mealPlanEntries)
      .set({ pantryUsed: null })
      .where(eq(mealPlanEntries.id, current.id))
  }
  // Cooking a planned meal is the same as "I made this", and uses up its
  // ingredients.
  if (status === "cooked" && current.status !== "cooked" && current.recipeId) {
    const made = [current.recipeId, current.withRecipeId].filter(
      (id): id is string => Boolean(id)
    )
    await db
      .update(recipes)
      .set({ lastMadeAt: new Date() })
      .where(inArray(recipes.id, made))
    await cooked(db, householdId, current.id)
  }
  return getEntry(db, current.id)
}

/** Takes a cooked meal's ingredients out of the pantry, remembering how to put them back. */
async function cooked(db: Db, householdId: string, id: string) {
  const used = await useForMeal(db, householdId, id)
  await db
    .update(mealPlanEntries)
    .set({ pantryUsed: used })
    .where(eq(mealPlanEntries.id, id))
}

export async function deleteEntry(db: Db, householdId: string, id: string) {
  const current = await findEntry(db, householdId, id)
  await db.delete(mealPlanEntries).where(eq(mealPlanEntries.id, current.id))
}

/**
 * Selected meals all at once (`POST /api/plan/bulk`): removed, moved to
 * another day (and meal), or marked cooked, skipped or planned again, each
 * as if done one at a time, so cooking still uses up the pantry. Onto the
 * list is the route's, with the list. Returns how many changed.
 */
export async function bulkPlanEntries(
  db: Db,
  householdId: string,
  input: Exclude<PlanBulkInput, { action: "toList" }>
) {
  const rows = await db
    .select()
    .from(mealPlanEntries)
    .where(
      and(
        eq(mealPlanEntries.householdId, householdId),
        inArray(mealPlanEntries.id, input.ids)
      )
    )
    .orderBy(
      asc(mealPlanEntries.date),
      asc(mealPlanEntries.position),
      asc(mealPlanEntries.createdAt)
    )
  if (input.action === "delete") {
    if (rows.length) {
      await db.delete(mealPlanEntries).where(
        inArray(
          mealPlanEntries.id,
          rows.map((row) => row.id)
        )
      )
    }
    return rows.length
  }
  let changed = 0
  for (const row of rows) {
    if (input.action === "status") {
      if (row.status === input.status) continue
      await updateEntry(db, householdId, row.id, { status: input.status })
    } else {
      await updateEntry(db, householdId, row.id, {
        date: input.date,
        meal: input.meal,
      })
    }
    changed++
  }
  return changed
}

/**
 * Last week's meals again: each onto the same day and meal of the week
 * starting `start`, where that meal is empty. Skipped ones stay behind.
 * Returns what was added.
 */
export async function repeatLastWeek(
  db: Db,
  householdId: string,
  start: string,
  userId: string | null
) {
  const last = await listEntries(
    db,
    householdId,
    addDays(start, -7),
    addDays(start, -1)
  )
  const taken = new Set(
    (await listEntries(db, householdId, start, addDays(start, 6))).map(
      (entry) => `${entry.date}|${entry.meal}`
    )
  )
  const added: PlanEntry[] = []
  for (const entry of last) {
    const date = addDays(entry.date, 7)
    if (entry.status === "skipped" || taken.has(`${date}|${entry.meal}`)) {
      continue
    }
    added.push(
      await addEntry(
        db,
        householdId,
        {
          date,
          meal: entry.meal,
          ...(entry.recipe
            ? { recipeId: entry.recipe.id, withRecipeId: entry.with?.id }
            : { note: entry.note ?? "A note" }),
          servings: entry.servings,
        },
        userId
      )
    )
  }
  return added
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
  for (const entry of updated) await cooked(db, householdId, entry.id)
  return updated.length
}
