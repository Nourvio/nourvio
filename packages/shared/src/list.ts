import { z } from "zod"

import { isoDate } from "./plan.ts"
import { SHOPS, type ShopId } from "./shopping.ts"
import { STORE_SECTION_IDS, type StoreSectionId } from "./stores.ts"

export const LIST_SOURCES = ["plan", "manual", "weekly"] as const
export type ListSource = (typeof LIST_SOURCES)[number]

export type ShoppingItem = {
  id: string
  /** Which of the household's lists it's on (MAIN_LIST unless moved). */
  listId: string
  name: string
  /** "1 ½ lb", "2 cans", "2 × 12-pack", or empty. */
  amount: string
  quantity: number | null
  unitId: string | null
  sectionId: StoreSectionId
  checked: boolean
  source: ListSource
  /** The recipes it's for. */
  recipes: string[]
}

/** Something bought every week whatever's planned, like Diet Pepsi. */
export type WeeklyItem = {
  id: string
  name: string
  amount: string | null
  sectionId: StoreSectionId
}

/** The list everything goes on unless a rule or a move says otherwise. It can't be removed. */
export const MAIN_LIST = "main"

/**
 * One of the household's shopping lists, usually for a store: "Costco"
 * for meat and soda, the main list for everything else.
 */
export type ShoppingList = {
  id: string
  name: string
  /** The store it's for, so Send to Fry's, Shop at Costco and the Walmart cart use it. */
  store: ShopId | null
  /** Aisles that go on this list by default ("Meat & seafood"). */
  sections: StoreSectionId[]
}

export const DEFAULT_LISTS: ShoppingList[] = [
  { id: MAIN_LIST, name: "Groceries", store: null, sections: [] },
]

const listId = z
  .string()
  .trim()
  .regex(/^[a-z0-9-]{1,40}$/, "A list's id is letters, numbers and dashes")

export const shoppingListsInput = z
  .object({
    lists: z
      .array(
        z.object({
          id: listId,
          name: z.string().trim().min(1, "Name the list").max(40),
          store: z.enum(SHOPS).nullable(),
          sections: z
            .array(z.enum(STORE_SECTION_IDS))
            .max(STORE_SECTION_IDS.length),
        })
      )
      .min(1)
      .max(10),
  })
  .superRefine(({ lists }, ctx) => {
    const fail = (message: string) =>
      ctx.addIssue({ code: "custom", message, path: ["lists"] })
    if (lists.filter((list) => list.id === MAIN_LIST).length !== 1) {
      fail("The main list has to stay")
    }
    if (new Set(lists.map((list) => list.id)).size !== lists.length) {
      fail("Two lists have the same id")
    }
    const stores = lists.flatMap((list) => (list.store ? [list.store] : []))
    if (new Set(stores).size !== stores.length) fail("One list per store")
    const sections = lists.flatMap((list) => list.sections)
    if (new Set(sections).size !== sections.length) {
      fail("An aisle can go on only one list")
    }
  })
export type ShoppingListsInput = z.input<typeof shoppingListsInput>

/**
 * The lists a store shops from: the one for that store, else the lists
 * that aren't for any store (the main list, as it is to start with).
 */
export function listsForStore(lists: ShoppingList[], store: ShopId) {
  const own = lists.filter((list) => list.store === store)
  return new Set(
    (own.length ? own : lists.filter((list) => !list.store)).map(
      (list) => list.id
    )
  )
}

export const addListItemInput = z.object({
  /** As typed: "2 lb ground beef" or "paper towels". */
  text: z.string().trim().min(1, "Type an item").max(200),
  /** Put it on this list (else wherever its food or aisle goes). */
  listId: listId.optional(),
})

export const updateListItemInput = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  /** Free text; amounts like "2 lb" are understood. Empty clears it. */
  amount: z.string().trim().max(60).optional(),
  sectionId: z.enum(STORE_SECTION_IDS).optional(),
  checked: z.boolean().optional(),
  /** Move it to another list; Nourvio remembers the food goes there. */
  listId: listId.optional(),
})
export type UpdateListItemInput = z.infer<typeof updateListItemInput>

export const addFromPlanInput = z.object({ from: isoDate, to: isoDate })

export type AddFromPlanResult = {
  /** Planned meals added this time. */
  meals: number
  /** New lines on the list. */
  added: number
  /** Lines that already were on the list and got more. */
  merged: number
  /** Every-week items added. */
  weekly: number
  /** Ingredients left off because they're always on hand. */
  onHand: string[]
  /** Ingredients left off because they're in the pantry. */
  inPantry: string[]
}

export const onHandInput = z.object({
  items: z.array(z.string().trim().min(1).max(60)).max(200),
})

export const weeklyItemInput = z.object({
  name: z.string().trim().min(1, "Name the item").max(100),
  amount: z.string().trim().max(60).nullable().optional(),
  sectionId: z.enum(STORE_SECTION_IDS).optional(),
})
export type WeeklyItemInput = z.infer<typeof weeklyItemInput>
