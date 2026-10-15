import {
  addAmounts,
  combineLines,
  foodKey,
  formatAmount,
  guessUseBy,
  onHandTest,
  pantryKey,
  parseIngredient,
  STORE_SECTIONS,
  subtractAmounts,
  toIsoDate,
  type PantryBulkInput,
  type PantryItem,
  type PantryMeal,
  type PutAwayResult,
  type StoreSectionId,
  type UpdatePantryItemInput,
} from "@mise/shared"
import { and, eq, inArray } from "drizzle-orm"
import { z } from "zod"

import type { Db } from "../db/client.ts"
import {
  foodSections,
  mealPlanEntries,
  pantryItems,
  recipes,
  shoppingItems,
  type PantrySnapshot,
} from "../db/schema.ts"
import { HttpError } from "../http.ts"
import { getHousehold } from "./households.ts"
import { readAmount, sectionsFor } from "./food.ts"
import { mealLines } from "./meal-lines.ts"

type PantryRow = typeof pantryItems.$inferSelect

const SECTION_ORDER = new Map<string, number>(
  STORE_SECTIONS.map((section) => [section.id, section.sortOrder])
)

function toItem(row: PantryRow, meals: Map<string, PantryMeal>): PantryItem {
  return {
    id: row.id,
    name: row.name,
    amount: row.amountText ?? formatAmount(row.quantity, row.unitId),
    quantity: row.quantity,
    unitId: row.unitId,
    sectionId: row.sectionId,
    useBy: row.useBy,
    meals: row.entries.flatMap((id) => meals.get(id) ?? []),
    addedAt: row.createdAt.toISOString(),
  }
}

/** The planned meals pantry items were bought for, by id. */
async function mealsFor(db: Db, householdId: string, rows: PantryRow[]) {
  const ids = [...new Set(rows.flatMap((row) => row.entries))]
  const found = ids.length
    ? await db
        .select({
          id: mealPlanEntries.id,
          date: mealPlanEntries.date,
          meal: mealPlanEntries.meal,
          status: mealPlanEntries.status,
          name: recipes.name,
        })
        .from(mealPlanEntries)
        .innerJoin(recipes, eq(mealPlanEntries.recipeId, recipes.id))
        .where(
          and(
            eq(mealPlanEntries.householdId, householdId),
            inArray(mealPlanEntries.id, ids)
          )
        )
    : []
  return new Map<string, PantryMeal>(found.map((meal) => [meal.id, meal]))
}

/** Everything in the pantry, in store order. */
export async function listPantry(db: Db, householdId: string) {
  const rows = await db
    .select()
    .from(pantryItems)
    .where(eq(pantryItems.householdId, householdId))
  const meals = await mealsFor(db, householdId, rows)
  return rows
    .sort(
      (a, b) =>
        (SECTION_ORDER.get(a.sectionId) ?? 999) -
          (SECTION_ORDER.get(b.sectionId) ?? 999) ||
        a.name.localeCompare(b.name)
    )
    .map((row) => toItem(row, meals))
}

async function findItem(db: Db, householdId: string, id: string) {
  const [row] = z.uuid().safeParse(id).success
    ? await db
        .select()
        .from(pantryItems)
        .where(
          and(eq(pantryItems.id, id), eq(pantryItems.householdId, householdId))
        )
    : []
  if (!row) throw new HttpError(404, "That isn't in the pantry")
  return row
}

async function itemById(db: Db, householdId: string, id: string) {
  const row = await findItem(db, householdId, id)
  return toItem(row, await mealsFor(db, householdId, [row]))
}

type NewItem = {
  name: string
  quantity: number | null
  unitId: string | null
  amountText: string | null
  sectionId: StoreSectionId
  useBy: string | null
  entries: string[]
}

const hasAmount = (item: {
  quantity: number | null
  amountText: string | null
}) => item.quantity !== null || item.amountText !== null

/**
 * Puts something in the pantry. The same food merges into what's there when
 * the amounts add up (or one of them is just "have it"), keeping the earlier
 * use-by date; otherwise it gets its own row.
 */
async function store(db: Db, householdId: string, item: NewItem) {
  const key = pantryKey(item.name)
  const existing = await db
    .select()
    .from(pantryItems)
    .where(
      and(eq(pantryItems.householdId, householdId), eq(pantryItems.key, key))
    )

  for (const row of existing) {
    let amount: Pick<NewItem, "quantity" | "unitId" | "amountText"> | null =
      null
    if (!hasAmount(row)) {
      amount = item
    } else if (!hasAmount(item)) {
      amount = row
    } else if (row.amountText === null && item.amountText === null) {
      const sum = addAmounts(row, item)
      if (sum) amount = { ...sum, amountText: null }
    }
    if (!amount) continue
    const useBy =
      row.useBy && item.useBy
        ? row.useBy < item.useBy
          ? row.useBy
          : item.useBy
        : (row.useBy ?? item.useBy)
    const [updated] = await db
      .update(pantryItems)
      .set({
        quantity: amount.quantity,
        unitId: amount.unitId,
        amountText: amount.amountText,
        useBy,
        entries: [...new Set([...row.entries, ...item.entries])],
      })
      .where(eq(pantryItems.id, row.id))
      .returning()
    return updated!
  }

  const [row] = await db
    .insert(pantryItems)
    .values({ householdId, key, ...item })
    .returning()
  return row!
}

/** Something typed in: "2 lb chicken thighs" or "rice". */
export async function addPantryItem(db: Db, householdId: string, text: string) {
  const parsed = parseIngredient(text)
  const withAmount = parsed.quantity !== null && parsed.food
  const name = withAmount ? parsed.food! : text.trim()
  const unitId = withAmount ? parsed.unitId : null
  const [sectionId] = await sectionsFor(db, householdId, [{ name, unitId }])
  const row = await store(db, householdId, {
    name,
    quantity: withAmount ? (parsed.quantityMax ?? parsed.quantity) : null,
    unitId,
    amountText: null,
    sectionId: sectionId!,
    useBy: guessUseBy(name, sectionId!, toIsoDate(new Date())),
    entries: [],
  })
  return itemById(db, householdId, row.id)
}

export async function updatePantryItem(
  db: Db,
  householdId: string,
  id: string,
  input: UpdatePantryItemInput
) {
  const current = await findItem(db, householdId, id)
  const patch: Partial<typeof pantryItems.$inferInsert> = {}
  if (input.name) {
    patch.name = input.name
    patch.key = pantryKey(input.name)
  }
  if (input.amount !== undefined) Object.assign(patch, readAmount(input.amount))
  if (input.sectionId) patch.sectionId = input.sectionId
  if (input.useBy !== undefined) patch.useBy = input.useBy
  await db.update(pantryItems).set(patch).where(eq(pantryItems.id, current.id))
  return itemById(db, householdId, current.id)
}

/** Used up, or thrown out. */
export async function deletePantryItem(
  db: Db,
  householdId: string,
  id: string
) {
  const current = await findItem(db, householdId, id)
  await db.delete(pantryItems).where(eq(pantryItems.id, current.id))
}

/** The pantry rows among these ids that are this household's. */
export async function pantryRows(db: Db, householdId: string, ids: string[]) {
  return db
    .select()
    .from(pantryItems)
    .where(
      and(
        eq(pantryItems.householdId, householdId),
        inArray(pantryItems.id, ids)
      )
    )
}

/**
 * Selected pantry items all at once (`POST /api/pantry/bulk`): used up, to
 * another aisle (remembered for next time), or a new use-by date. Onto the
 * list is the route's, with the list. Returns how many changed.
 */
export async function bulkPantryItems(
  db: Db,
  householdId: string,
  input: Exclude<PantryBulkInput, { action: "toList" }>
) {
  const rows = await pantryRows(db, householdId, input.ids)
  if (!rows.length) return 0
  const ids = rows.map((row) => row.id)
  switch (input.action) {
    case "delete":
      await db.delete(pantryItems).where(inArray(pantryItems.id, ids))
      break
    case "aisle": {
      await db
        .update(pantryItems)
        .set({ sectionId: input.sectionId })
        .where(inArray(pantryItems.id, ids))
      const foods = [...new Set(rows.map((row) => foodKey(row.name)))]
      await db
        .insert(foodSections)
        .values(
          foods.map((food) => ({
            householdId,
            food,
            sectionId: input.sectionId,
          }))
        )
        .onConflictDoUpdate({
          target: [foodSections.householdId, foodSections.food],
          set: { sectionId: input.sectionId },
        })
      break
    }
    case "useBy":
      await db
        .update(pantryItems)
        .set({ useBy: input.useBy })
        .where(inArray(pantryItems.id, ids))
      break
  }
  return rows.length
}

/**
 * Done shopping: checked list items go into the pantry, remembering the
 * meals they're for, with a guessed use-by date for fresh food. Household
 * things and what's always on hand are just cleared.
 */
export async function putAway(
  db: Db,
  householdId: string
): Promise<PutAwayResult> {
  const household = await getHousehold(db, householdId)
  const isOnHand = onHandTest(household.onHand)
  const checked = await db
    .select()
    .from(shoppingItems)
    .where(
      and(
        eq(shoppingItems.householdId, householdId),
        eq(shoppingItems.checked, true)
      )
    )
  const today = toIsoDate(new Date())
  let stored = 0
  for (const item of checked) {
    if (item.sectionId === "household" || isOnHand(item.name)) {
      continue
    }
    await store(db, householdId, {
      name: item.name,
      quantity: item.quantity,
      unitId: item.unitId,
      amountText: item.amountText,
      sectionId: item.sectionId,
      useBy: guessUseBy(item.name, item.sectionId, today),
      entries: item.entries,
    })
    stored++
  }
  if (checked.length) {
    await db.delete(shoppingItems).where(
      inArray(
        shoppingItems.id,
        checked.map((item) => item.id)
      )
    )
  }
  return { stored, skipped: checked.length - stored }
}

const snapshot = (row: PantryRow, removed: boolean): PantrySnapshot => ({
  id: row.id,
  key: row.key,
  name: row.name,
  quantity: row.quantity,
  unitId: row.unitId,
  amountText: row.amountText,
  sectionId: row.sectionId,
  useBy: row.useBy,
  entries: row.entries,
  removed,
})

/**
 * Cooking a planned meal takes its ingredients out of the pantry, scaled to
 * its servings. Amounts that can be compared are subtracted; something
 * bought for this meal without a comparable amount is used up; anything
 * else ("have it" rice) stays. Returns the rows as they were, to put back.
 */
export async function useForMeal(
  db: Db,
  householdId: string,
  entryId: string
): Promise<PantrySnapshot[]> {
  const [entry] = await db
    .select()
    .from(mealPlanEntries)
    .where(
      and(
        eq(mealPlanEntries.id, entryId),
        eq(mealPlanEntries.householdId, householdId)
      )
    )
  if (!entry?.recipeId) return []
  const needs = combineLines(
    await mealLines(db, householdId, { ...entry, recipeId: entry.recipeId })
  )

  const rows = await db
    .select()
    .from(pantryItems)
    .where(eq(pantryItems.householdId, householdId))
  const before = new Map<string, PantryRow>()
  const removed = new Set<string>()
  const change = (row: PantryRow) => {
    if (!before.has(row.id)) before.set(row.id, { ...row })
  }

  for (const need of needs) {
    const key = pantryKey(need.name)
    // What was bought for this meal goes first.
    const matches = rows
      .filter((row) => row.key === key && !removed.has(row.id))
      .sort(
        (a, b) =>
          Number(b.entries.includes(entryId)) -
          Number(a.entries.includes(entryId))
      )
    let left: { quantity: number | null; unitId: string | null } = need
    for (const row of matches) {
      const forThis = row.entries.includes(entryId)
      const rest = row.amountText === null ? subtractAmounts(row, left) : null
      if (!rest) {
        // Can't tell how much is left: used up if it was bought for this.
        if (forThis) {
          change(row)
          removed.add(row.id)
        }
        break
      }
      change(row)
      if (rest.quantity > 0.001) {
        row.quantity = rest.quantity
        break
      }
      removed.add(row.id)
      // Not enough in this one: take the rest from the next.
      const still = subtractAmounts(left, row)
      if (!still || still.quantity <= 0.001) break
      left = still
    }
  }

  for (const [id, original] of before) {
    if (removed.has(id)) {
      await db.delete(pantryItems).where(eq(pantryItems.id, id))
    } else {
      const row = rows.find((r) => r.id === id)!
      await db
        .update(pantryItems)
        .set({
          quantity: row.quantity,
          entries: original.entries.filter((e) => e !== entryId),
        })
        .where(eq(pantryItems.id, id))
    }
  }
  return [...before].map(([id, original]) =>
    snapshot(original, removed.has(id))
  )
}

/** Puts back what cooking a meal took out, when it turns out it wasn't cooked. */
export async function restoreForMeal(
  db: Db,
  householdId: string,
  used: PantrySnapshot[]
) {
  for (const { removed, id, ...values } of used) {
    if (removed) {
      await db
        .insert(pantryItems)
        .values({ id, householdId, ...values })
        .onConflictDoUpdate({ target: pantryItems.id, set: values })
    } else {
      await db
        .update(pantryItems)
        .set(values)
        .where(
          and(eq(pantryItems.id, id), eq(pantryItems.householdId, householdId))
        )
    }
  }
}
