import {
  addAmounts,
  combineLines,
  foodKey,
  formatAmount,
  listsForStore,
  MAIN_LIST,
  onHandTest,
  pantryKey,
  parseIngredient,
  STORE_SECTIONS,
  subtractAmounts,
  toIsoDate,
  type AddFromPlanResult,
  type ListLine,
  type PantryItem,
  type ShopId,
  type ShoppingItem,
  type ShoppingList,
  type StoreSectionId,
  type UpdateListItemInput,
  type WeeklyItem,
  type WeeklyItemInput,
} from "@mise/shared"
import { and, asc, eq, gte, inArray, isNull, lte } from "drizzle-orm"
import { z } from "zod"

import type { Db } from "../db/client.ts"
import {
  foodLists,
  foodSections,
  mealPlanEntries,
  recipes,
  shoppingItems,
  weeklyItems,
} from "../db/schema.ts"
import { HttpError } from "../http.ts"
import { readAmount, sectionsFor } from "./food.ts"
import { mealLines } from "./meal-lines.ts"
import { getRecipe } from "./recipes.ts"
import { listPantry } from "./pantry.ts"
import { getHousehold } from "./households.ts"

type ItemRow = typeof shoppingItems.$inferSelect

const SECTION_ORDER = new Map<string, number>(
  STORE_SECTIONS.map((section) => [section.id, section.sortOrder])
)

export function toItem(row: ItemRow): ShoppingItem {
  return {
    id: row.id,
    listId: row.listId ?? MAIN_LIST,
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
export const foodOf = (key: string) => key.split("|")[0]!

/** The list's rows in aisle order, oldest first within an aisle. */
export async function listRows(db: Db, householdId: string) {
  const rows = await db
    .select()
    .from(shoppingItems)
    .where(eq(shoppingItems.householdId, householdId))
    .orderBy(asc(shoppingItems.createdAt))
  return rows.sort(
    (a, b) =>
      (SECTION_ORDER.get(a.sectionId) ?? 999) -
      (SECTION_ORDER.get(b.sectionId) ?? 999)
  )
}

export async function listItems(db: Db, householdId: string) {
  return (await listRows(db, householdId)).map(toItem)
}

/** The rows a store shops from: its own list, else the lists for no store (see listsForStore). */
export async function listRowsForStore(
  db: Db,
  householdId: string,
  store: ShopId
) {
  const { lists } = await getHousehold(db, householdId)
  const ids = listsForStore(lists, store)
  return (await listRows(db, householdId)).filter((row) =>
    ids.has(row.listId ?? MAIN_LIST)
  )
}

/**
 * After the lists change: what's waiting on the main list moves to the
 * list its food or aisle goes on now. Things moved by hand stay put.
 */
export async function sortOntoLists(db: Db, householdId: string) {
  const rows = await db
    .select()
    .from(shoppingItems)
    .where(
      and(
        eq(shoppingItems.householdId, householdId),
        eq(shoppingItems.checked, false),
        isNull(shoppingItems.listId)
      )
    )
  const targets = await listsFor(db, householdId, rows)
  for (const [i, row] of rows.entries()) {
    if (targets[i]) {
      await db
        .update(shoppingItems)
        .set({ listId: targets[i] })
        .where(eq(shoppingItems.id, row.id))
    }
  }
}

/** A list id as stored on an item: null for the main list, or for one that doesn't exist. */
function storedList(lists: ShoppingList[], id: string | undefined | null) {
  if (!id || id === MAIN_LIST) return null
  return lists.some((list) => list.id === id) ? id : null
}

/**
 * Which list each item goes on: where its food was moved to before, else
 * the list its aisle goes on, else the main list.
 */
async function listsFor(
  db: Db,
  householdId: string,
  items: { name: string; sectionId: StoreSectionId }[]
) {
  const { lists } = await getHousehold(db, householdId)
  if (lists.length < 2) return items.map(() => null)
  const bySection = new Map(
    lists.flatMap((list) => list.sections.map((section) => [section, list.id]))
  )
  const foods = items.map((item) => foodKey(item.name))
  const learned = foods.length
    ? await db
        .select()
        .from(foodLists)
        .where(
          and(
            eq(foodLists.householdId, householdId),
            inArray(foodLists.food, foods)
          )
        )
    : []
  const byFood = new Map(learned.map((row) => [row.food, row.listId]))
  return items.map((item, i) =>
    storedList(
      lists,
      byFood.get(foods[i]!) ?? bySection.get(item.sectionId) ?? null
    )
  )
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

/** Something typed in: "2 lb ground beef" or "paper towels", on a list if given. */
export async function addManualItem(
  db: Db,
  householdId: string,
  text: string,
  listId?: string
) {
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
      listId:
        listId === undefined
          ? (
              await listsFor(db, householdId, [{ name, sectionId: section! }])
            )[0]
          : storedList((await getHousehold(db, householdId)).lists, listId),
    })
    .returning()
  return toItem(row!)
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
  if (input.listId !== undefined) {
    const { lists } = await getHousehold(db, householdId)
    if (
      input.listId !== MAIN_LIST &&
      !lists.some((l) => l.id === input.listId)
    ) {
      throw new HttpError(404, "That list isn't here any more")
    }
    patch.listId = storedList(lists, input.listId)
    // Remember it: next time this food goes on that list by itself.
    const food = foodKey(input.name ?? current.name)
    await db
      .insert(foodLists)
      .values({ householdId, food, listId: input.listId })
      .onConflictDoUpdate({
        target: [foodLists.householdId, foodLists.food],
        set: { listId: input.listId },
      })
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
    const lists = await listsFor(db, householdId, missing)
    await db.insert(shoppingItems).values(
      missing.map((item, i) => ({
        householdId,
        key: `${foodKey(item.name)}|weekly`,
        name: item.name,
        amountText: item.amount,
        sectionId: item.sectionId,
        source: "weekly" as const,
        listId: lists[i],
      }))
    )
  }
  return missing.length
}

/**
 * What's in the pantry and free to use: anything not set aside for a meal
 * still coming up.
 */
async function availableInPantry(db: Db, householdId: string) {
  const today = toIsoDate(new Date())
  return (await listPantry(db, householdId)).filter(
    (item) =>
      !item.meals.some(
        (meal) => meal.status === "planned" && meal.date >= today
      )
  )
}

/**
 * How much of an ingredient is left to buy after what's in the pantry, or
 * null when the pantry covers it. Having some of it without an amount that
 * compares ("half a bag", or just "have it") counts as covered.
 */
function leftToBuy(
  item: { name: string; quantity: number | null; unitId: string | null },
  pantry: PantryItem[]
) {
  const key = pantryKey(item.name)
  let need = { quantity: item.quantity, unitId: item.unitId }
  let found = false
  for (const have of pantry) {
    if (pantryKey(have.name) !== key) continue
    found = true
    const rest = subtractAmounts(need, have)
    if (!rest || rest.quantity <= 0.001) return null
    need = rest
  }
  return found ? need : { quantity: item.quantity, unitId: item.unitId }
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
  const entries = await db
    .select({
      id: mealPlanEntries.id,
      recipeId: mealPlanEntries.recipeId,
      withRecipeId: mealPlanEntries.withRecipeId,
      servings: mealPlanEntries.servings,
    })
    .from(mealPlanEntries)
    .innerJoin(recipes, eq(mealPlanEntries.recipeId, recipes.id))
    .where(
      and(
        eq(mealPlanEntries.householdId, householdId),
        isNull(recipes.deletedAt),
        gte(mealPlanEntries.date, from),
        lte(mealPlanEntries.date, to),
        eq(mealPlanEntries.status, "planned"),
        isNull(mealPlanEntries.listedAt)
      )
    )

  const lines: ListLine[] = []
  for (const entry of entries) {
    lines.push(
      ...(await mealLines(db, householdId, {
        ...entry,
        recipeId: entry.recipeId!,
      }))
    )
  }

  const { added, merged, skipped, inPantry } = await addLinesToList(
    db,
    householdId,
    lines
  )

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
  return {
    meals: entries.length,
    added,
    merged,
    weekly,
    onHand: skipped,
    inPantry,
  }
}

/**
 * Ingredient lines onto the list: combined, leaving out always-on-hand food
 * and what the pantry has, merged into what's waiting there already.
 */
async function addLinesToList(db: Db, householdId: string, lines: ListLine[]) {
  const household = await getHousehold(db, householdId)
  const isOnHand = onHandTest(household.onHand)
  const skipped: string[] = []
  const pantry = await availableInPantry(db, householdId)
  const inPantry: string[] = []
  const combined = combineLines(lines).filter((item) => {
    if (isOnHand(item.name)) {
      skipped.push(item.name)
      return false
    }
    const need = leftToBuy(item, pantry)
    if (!need) {
      inPantry.push(item.name)
      return false
    }
    Object.assign(item, need)
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
    const lists = await listsFor(
      db,
      householdId,
      combined.map((item, i) => ({ name: item.name, sectionId: sections[i]! }))
    )
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
          listId: lists[i],
        })
        added++
      }
    }
  }

  return { added, merged, skipped, inPantry }
}

/** Recipes' ingredients onto the list, as written (selected on Recipes). */
export async function addRecipesToList(
  db: Db,
  householdId: string,
  recipeIds: string[]
) {
  const lines: ListLine[] = []
  for (const id of recipeIds) {
    const recipe = await getRecipe(db, householdId, id).catch(() => null)
    if (!recipe) continue
    for (const ingredient of recipe.ingredients) {
      lines.push({ text: ingredient.text, factor: 1, source: recipe.name })
    }
  }
  const { added, merged, skipped, inPantry } = await addLinesToList(
    db,
    householdId,
    lines
  )
  return { added, merged, onHand: skipped, inPantry }
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
