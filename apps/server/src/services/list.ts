import {
  addAmounts,
  combineLines,
  foodKey,
  formatAmount,
  guessSection,
  parseIngredient,
  STORE_SECTIONS,
  type AddFromPlanResult,
  type ListLine,
  type ShoppingItem,
  type StoreSectionId,
  type UpdateListItemInput,
  type WeeklyItem,
  type WeeklyItemInput,
} from "@mise/shared"
import { and, asc, eq, gte, inArray, isNull, lte } from "drizzle-orm"
import { z } from "zod"

import type { Db } from "../db/client.ts"
import {
  foodSections,
  mealPlanEntries,
  recipes,
  shoppingItems,
  weeklyItems,
} from "../db/schema.ts"
import { HttpError } from "../http.ts"
import { getHousehold } from "./households.ts"
import { getRecipe } from "./recipes.ts"

type ItemRow = typeof shoppingItems.$inferSelect

const SECTION_ORDER = new Map<string, number>(
  STORE_SECTIONS.map((section) => [section.id, section.sortOrder])
)

function toItem(row: ItemRow): ShoppingItem {
  return {
    id: row.id,
    name: row.name,
    amount: row.amountText ?? formatAmount(row.quantity, row.unitId),
    quantity: row.quantity,
    unitId: row.unitId,
    sectionId: row.sectionId,
    checked: row.checked,
    source: row.source,
    recipes: row.recipes,
  }
}

/** The food part of an item key: "onion|each" → "onion". */
const foodOf = (key: string) => key.split("|")[0]!

/** Where to file a food: the household's own choice, else a guess. */
export async function sectionsFor(
  db: Db,
  householdId: string,
  items: { name: string; unitId?: string | null }[]
) {
  const foods = items.map((item) => foodKey(item.name))
  const learned = foods.length
    ? await db
        .select()
        .from(foodSections)
        .where(
          and(
            eq(foodSections.householdId, householdId),
            inArray(foodSections.food, foods)
          )
        )
    : []
  const byFood = new Map(learned.map((row) => [row.food, row.sectionId]))
  return items.map(
    (item, i): StoreSectionId =>
      byFood.get(foods[i]!) ?? guessSection(item.name, item.unitId)
  )
}

export async function listItems(db: Db, householdId: string) {
  const rows = await db
    .select()
    .from(shoppingItems)
    .where(eq(shoppingItems.householdId, householdId))
    .orderBy(asc(shoppingItems.createdAt))
  return rows
    .sort(
      (a, b) =>
        (SECTION_ORDER.get(a.sectionId) ?? 999) -
        (SECTION_ORDER.get(b.sectionId) ?? 999)
    )
    .map(toItem)
}

async function findItem(db: Db, householdId: string, id: string) {
  const [row] = z.uuid().safeParse(id).success
    ? await db
        .select()
        .from(shoppingItems)
        .where(
          and(
            eq(shoppingItems.id, id),
            eq(shoppingItems.householdId, householdId)
          )
        )
    : []
  if (!row) throw new HttpError(404, "That item isn't on the list")
  return row
}

/** Something typed in: "2 lb ground beef" or "paper towels". */
export async function addManualItem(db: Db, householdId: string, text: string) {
  const parsed = parseIngredient(text)
  const hasAmount = parsed.quantity !== null && parsed.food
  const name = hasAmount ? parsed.food! : text.trim()
  const quantity = hasAmount ? (parsed.quantityMax ?? parsed.quantity) : null
  const [section] = await sectionsFor(db, householdId, [
    { name, unitId: hasAmount ? parsed.unitId : null },
  ])
  const [row] = await db
    .insert(shoppingItems)
    .values({
      householdId,
      key: `${foodKey(name)}|manual`,
      name,
      quantity,
      unitId: hasAmount ? parsed.unitId : null,
      sectionId: section!,
      source: "manual",
    })
    .returning()
  return toItem(row!)
}

/** An amount as typed: "2 lb" becomes a number and a unit; anything else stays as written. Empty clears it. */
export function readAmount(amount: string) {
  const parsed = amount ? parseIngredient(`${amount} x`) : null
  return parsed?.quantity !== null &&
    parsed?.quantity !== undefined &&
    parsed.food === "x"
    ? {
        quantity: parsed.quantityMax ?? parsed.quantity,
        unitId: parsed.unitId,
        amountText: null,
      }
    : { quantity: null, unitId: null, amountText: amount || null }
}

export async function updateItem(
  db: Db,
  householdId: string,
  id: string,
  input: UpdateListItemInput
) {
  const current = await findItem(db, householdId, id)
  const patch: Partial<typeof shoppingItems.$inferInsert> = {}
  if (input.name) patch.name = input.name
  if (input.amount !== undefined) Object.assign(patch, readAmount(input.amount))
  if (input.checked !== undefined) {
    patch.checked = input.checked
    patch.checkedAt = input.checked ? new Date() : null
  }
  if (input.sectionId && input.sectionId !== current.sectionId) {
    patch.sectionId = input.sectionId
    // Remember it for next time.
    const food = foodKey(input.name ?? current.name)
    await db
      .insert(foodSections)
      .values({ householdId, food, sectionId: input.sectionId })
      .onConflictDoUpdate({
        target: [foodSections.householdId, foodSections.food],
        set: { sectionId: input.sectionId },
      })
  }
  const [row] = await db
    .update(shoppingItems)
    .set(patch)
    .where(eq(shoppingItems.id, current.id))
    .returning()
  return toItem(row!)
}

export async function deleteItem(db: Db, householdId: string, id: string) {
  const current = await findItem(db, householdId, id)
  await db.delete(shoppingItems).where(eq(shoppingItems.id, current.id))
}

export async function clearChecked(db: Db, householdId: string) {
  const removed = await db
    .delete(shoppingItems)
    .where(
      and(
        eq(shoppingItems.householdId, householdId),
        eq(shoppingItems.checked, true)
      )
    )
    .returning({ id: shoppingItems.id })
  return removed.length
}

/** Adds the every-week items that aren't already on the list. */
export async function addWeeklyItems(db: Db, householdId: string) {
  const weekly = await db
    .select()
    .from(weeklyItems)
    .where(eq(weeklyItems.householdId, householdId))
    .orderBy(asc(weeklyItems.createdAt))
  if (!weekly.length) return 0
  const onList = await db
    .select({ key: shoppingItems.key })
    .from(shoppingItems)
    .where(
      and(
        eq(shoppingItems.householdId, householdId),
        eq(shoppingItems.checked, false)
      )
    )
  const have = new Set(onList.map((row) => row.key))
  const missing = weekly.filter(
    (item) => !have.has(`${foodKey(item.name)}|weekly`)
  )
  if (missing.length) {
    await db.insert(shoppingItems).values(
      missing.map((item) => ({
        householdId,
        key: `${foodKey(item.name)}|weekly`,
        name: item.name,
        amountText: item.amount,
        sectionId: item.sectionId,
        source: "weekly" as const,
      }))
    )
  }
  return missing.length
}

/**
 * Adds the ingredients of planned meals from one date to another that
 * aren't on the list yet: combined across recipes, scaled to the planned
 * servings, merged into what's already on the list, and leaving out what's
 * always on hand. Every-week items come along too.
 */
export async function addFromPlan(
  db: Db,
  householdId: string,
  from: string,
  to: string
): Promise<AddFromPlanResult> {
  const household = await getHousehold(db, householdId)
  const entries = await db
    .select({
      id: mealPlanEntries.id,
      recipeId: mealPlanEntries.recipeId,
      servings: mealPlanEntries.servings,
    })
    .from(mealPlanEntries)
    .innerJoin(recipes, eq(mealPlanEntries.recipeId, recipes.id))
    .where(
      and(
        eq(mealPlanEntries.householdId, householdId),
        gte(mealPlanEntries.date, from),
        lte(mealPlanEntries.date, to),
        eq(mealPlanEntries.status, "planned"),
        isNull(mealPlanEntries.listedAt)
      )
    )

  const lines: ListLine[] = []
  for (const entry of entries) {
    const recipe = await getRecipe(db, householdId, entry.recipeId!)
    const factor =
      entry.servings && recipe.servings ? entry.servings / recipe.servings : 1
    for (const ingredient of recipe.ingredients) {
      lines.push({
        text: ingredient.text,
        factor,
        source: recipe.name,
        entryId: entry.id,
      })
    }
  }

  const onHand = new Set(household.onHand.map(foodKey))
  const skipped: string[] = []
  const combined = combineLines(lines).filter((item) => {
    if (onHand.has(foodOf(item.key))) {
      skipped.push(item.name)
      return false
    }
    return true
  })

  let added = 0
  let merged = 0
  if (combined.length) {
    const existing = await db
      .select()
      .from(shoppingItems)
      .where(
        and(
          eq(shoppingItems.householdId, householdId),
          eq(shoppingItems.checked, false)
        )
      )
    const sections = await sectionsFor(db, householdId, combined)
    for (const [i, item] of combined.entries()) {
      const match = existing.find(
        (row) => foodOf(row.key) === foodOf(item.key) && row.amountText === null
      )
      const sum = match ? addAmounts(match, item) : null
      if (match && sum) {
        await db
          .update(shoppingItems)
          .set({
            quantity: sum.quantity,
            unitId: sum.unitId,
            recipes: [...new Set([...match.recipes, ...item.sources])],
            entries: [...new Set([...match.entries, ...item.entries])],
          })
          .where(eq(shoppingItems.id, match.id))
        Object.assign(match, sum)
        merged++
      } else {
        await db.insert(shoppingItems).values({
          householdId,
          key: item.key,
          name: item.name,
          quantity: item.quantity,
          unitId: item.unitId,
          sectionId: sections[i]!,
          source: "plan",
          recipes: item.sources,
          entries: item.entries,
        })
        added++
      }
    }
  }

  if (entries.length) {
    await db
      .update(mealPlanEntries)
      .set({ listedAt: new Date() })
      .where(
        inArray(
          mealPlanEntries.id,
          entries.map((entry) => entry.id)
        )
      )
  }
  const weekly = await addWeeklyItems(db, householdId)
  return { meals: entries.length, added, merged, weekly, onHand: skipped }
}

// ---- Every-week items ----

type WeeklyRow = typeof weeklyItems.$inferSelect

const toWeekly = (row: WeeklyRow): WeeklyItem => ({
  id: row.id,
  name: row.name,
  amount: row.amount,
  sectionId: row.sectionId,
})

export async function listWeeklyItems(db: Db, householdId: string) {
  const rows = await db
    .select()
    .from(weeklyItems)
    .where(eq(weeklyItems.householdId, householdId))
    .orderBy(asc(weeklyItems.createdAt))
  return rows.map(toWeekly)
}

export async function addWeeklyItem(
  db: Db,
  householdId: string,
  input: WeeklyItemInput
) {
  const [section] = input.sectionId
    ? [input.sectionId]
    : await sectionsFor(db, householdId, [{ name: input.name }])
  const [row] = await db
    .insert(weeklyItems)
    .values({
      householdId,
      name: input.name,
      amount: input.amount || null,
      sectionId: section!,
    })
    .returning()
  return toWeekly(row!)
}

async function findWeekly(db: Db, householdId: string, id: string) {
  const [row] = z.uuid().safeParse(id).success
    ? await db
        .select()
        .from(weeklyItems)
        .where(
          and(eq(weeklyItems.id, id), eq(weeklyItems.householdId, householdId))
        )
    : []
  if (!row) throw new HttpError(404, "That every-week item doesn't exist")
  return row
}

export async function updateWeeklyItem(
  db: Db,
  householdId: string,
  id: string,
  input: Partial<WeeklyItemInput>
) {
  const current = await findWeekly(db, householdId, id)
  const [row] = await db
    .update(weeklyItems)
    .set({
      ...(input.name ? { name: input.name } : {}),
      ...(input.amount !== undefined ? { amount: input.amount || null } : {}),
      ...(input.sectionId ? { sectionId: input.sectionId } : {}),
    })
    .where(eq(weeklyItems.id, current.id))
    .returning()
  return toWeekly(row!)
}

export async function deleteWeeklyItem(
  db: Db,
  householdId: string,
  id: string
) {
  const current = await findWeekly(db, householdId, id)
  await db.delete(weeklyItems).where(eq(weeklyItems.id, current.id))
}
