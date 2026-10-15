import {
  addDays,
  guessSection,
  lineFood,
  localClock,
  usualPrice,
  type Deal,
  type Deals,
  type OnSale,
  type ShopId,
  type StoreProduct,
  type StoreSectionId,
} from "@mise/shared"
import { and, eq, gte, inArray, sql } from "drizzle-orm"

import type { Db } from "../db/client.ts"
import {
  foodSections,
  recipeIngredients,
  recipes,
  shopConnections,
  storePrices,
  storeProducts,
} from "../db/schema.ts"
import { getHousehold } from "./households.ts"
import { notDeleted } from "./recipes.ts"

/** A remembered price older than this isn't trusted to still be a sale. */
const FRESH_DAYS = 8

/** Today in the household's time zone, for the price history. */
export async function householdToday(
  db: Db,
  householdId: string,
  now = new Date()
) {
  const { autoPlan } = await getHousehold(db, householdId)
  return localClock(now, autoPlan.timeZone).date
}

/** Saves the prices just seen, one row per product a day (the latest wins). */
export async function recordPrices(
  db: Db,
  householdId: string,
  shop: ShopId,
  products: StoreProduct[],
  day: string
) {
  const byId = new Map(
    products
      .filter((p) => p.price !== null || p.salePrice !== null)
      .map((p) => [p.id, p])
  )
  if (!byId.size) return
  await db
    .insert(storePrices)
    .values(
      [...byId.values()].map((product) => ({
        householdId,
        shop,
        productId: product.id,
        day,
        price: product.price,
        salePrice: product.salePrice,
        saleEnds: product.saleEnds ?? null,
      }))
    )
    .onConflictDoUpdate({
      target: [
        storePrices.householdId,
        storePrices.shop,
        storePrices.productId,
        storePrices.day,
      ],
      set: {
        price: sql`excluded.price`,
        salePrice: sql`excluded.sale_price`,
        saleEnds: sql`excluded.sale_ends`,
      },
    })
}

/** What each product usually costs (see usualPrice), by product id. */
export async function usualPrices(
  db: Db,
  householdId: string,
  shop: ShopId,
  productIds: string[],
  today: string
) {
  const ids = [...new Set(productIds)]
  const rows = ids.length
    ? await db
        .select({
          productId: storePrices.productId,
          day: storePrices.day,
          price: storePrices.price,
        })
        .from(storePrices)
        .where(
          and(
            eq(storePrices.householdId, householdId),
            eq(storePrices.shop, shop),
            inArray(storePrices.productId, ids),
            gte(storePrices.day, addDays(today, -90))
          )
        )
    : []
  const byProduct = new Map<string, { day: string; price: number | null }[]>()
  for (const row of rows) {
    byProduct.set(row.productId, [...(byProduct.get(row.productId) ?? []), row])
  }
  return new Map(
    ids.map((id) => [id, usualPrice(byProduct.get(id) ?? [], today)])
  )
}

/** The aisle a food is in: where the household moved it, else Nourvio's guess. */
async function sectionsOf(db: Db, householdId: string) {
  const rows = await db
    .select({ food: foodSections.food, sectionId: foodSections.sectionId })
    .from(foodSections)
    .where(eq(foodSections.householdId, householdId))
  const moved = new Map(rows.map((row) => [row.food, row.sectionId]))
  return (key: string): StoreSectionId => moved.get(key) ?? guessSection(key)
}

/**
 * The foods in the household's recipes: each recipe's (as it names them),
 * and every food once, with its aisle and how many recipes use it.
 */
export async function recipeFoods(db: Db, householdId: string) {
  const rows = await db
    .select({
      recipeId: recipeIngredients.recipeId,
      rawText: recipeIngredients.rawText,
    })
    .from(recipeIngredients)
    .innerJoin(recipes, eq(recipeIngredients.recipeId, recipes.id))
    .where(and(eq(recipes.householdId, householdId), notDeleted))
  const sectionOf = await sectionsOf(db, householdId)
  const byRecipe = new Map<string, { name: string; key: string }[]>()
  const foods = new Map<
    string,
    { key: string; name: string; section: StoreSectionId; recipes: number }
  >()
  for (const row of rows) {
    const food = lineFood(row.rawText)
    if (!food) continue
    const mine = byRecipe.get(row.recipeId) ?? []
    if (mine.some((f) => f.key === food.key)) continue
    byRecipe.set(row.recipeId, [...mine, food])
    const found = foods.get(food.key)
    if (found) found.recipes++
    else {
      foods.set(food.key, {
        ...food,
        section: sectionOf(food.key),
        recipes: 1,
      })
    }
  }
  return { byRecipe, foods }
}

/**
 * What's on sale at the household's Fry's now, by food: remembered products
 * seen in the past week with a sale that hasn't ended.
 */
export async function currentDeals(
  db: Db,
  householdId: string,
  today: string,
  now = new Date()
) {
  const [conn] = await db
    .select()
    .from(shopConnections)
    .where(
      and(
        eq(shopConnections.householdId, householdId),
        eq(shopConnections.shop, "kroger")
      )
    )
  const deals = new Map<string, Deal>()
  if (!conn?.store) return { conn: conn ?? null, deals }
  const rows = await db
    .select()
    .from(storeProducts)
    .where(
      and(
        eq(storeProducts.householdId, householdId),
        eq(storeProducts.shop, "kroger"),
        gte(
          storeProducts.updatedAt,
          new Date(now.getTime() - FRESH_DAYS * 86_400_000)
        )
      )
    )
  const sectionOf = await sectionsOf(db, householdId)
  for (const { food, product } of rows) {
    if (product.salePrice === null || product.price === null) continue
    if (product.saleEnds && product.saleEnds < today) continue
    deals.set(food, {
      key: food,
      product: product.name,
      price: product.price,
      salePrice: product.salePrice,
      saleEnds: product.saleEnds ?? null,
      section: sectionOf(food),
    })
  }
  return { conn, deals }
}

/** What each recipe uses that's on sale, by recipe id. */
export function recipeSales(
  byRecipe: Map<string, { name: string; key: string }[]>,
  deals: Map<string, Deal>
) {
  const sales = new Map<string, (OnSale & { section: StoreSectionId })[]>()
  if (!deals.size) return sales
  for (const [recipeId, foods] of byRecipe) {
    const onSale = foods.flatMap((food) => {
      const deal = deals.get(food.key)
      return deal
        ? [
            {
              food: food.name,
              key: food.key,
              price: deal.price,
              salePrice: deal.salePrice,
              section: deal.section,
            },
          ]
        : []
    })
    if (onSale.length) sales.set(recipeId, onSale)
  }
  return sales
}

/** This week's sales and the recipes they're in (Recipes' "On sale"). */
export async function listDeals(db: Db, householdId: string): Promise<Deals> {
  const today = await householdToday(db, householdId)
  const { conn, deals } = await currentDeals(db, householdId, today)
  const { byRecipe } = await recipeFoods(db, householdId)
  const sales = recipeSales(byRecipe, deals)
  return {
    storeName: conn?.store?.banner ?? null,
    checkedAt: conn?.pricesCheckedAt?.toISOString() ?? null,
    deals: [...deals.values()].sort(
      (a, b) => b.price - b.salePrice - (a.price - a.salePrice)
    ),
    recipes: Object.fromEntries(
      [...sales].map(([id, onSale]) => [
        id,
        onSale.map(({ section: _, ...sale }) => sale),
      ])
    ),
  }
}
