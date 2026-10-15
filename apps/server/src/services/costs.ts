import {
  lineFood,
  onHandTest,
  parseProductSize,
  shareOf,
  type RecipeCostDetail,
  type RecipeCostLine,
  type ShopId,
  type StoreProduct,
} from "@mise/shared"
import { and, asc, eq, inArray } from "drizzle-orm"

import type { Db } from "../db/client.ts"
import { recipeIngredients, recipes, storeProducts } from "../db/schema.ts"
import { getHousehold } from "./households.ts"
import { needsFor } from "./shop.ts"

/** Stores whose remembered products have prices, Fry's first. */
const PRICED_SHOPS: ShopId[] = ["kroger", "walmart"]

const round = (value: number) => Math.round(value * 100) / 100

/**
 * What the household's recipes cost (or just these): each ingredient's
 * share of the product remembered for it, at today's price (the sale price
 * while there is one). Always-on-hand ingredients are left out.
 */
export async function recipeCosts(
  db: Db,
  householdId: string,
  recipeIds?: string[]
): Promise<Map<string, RecipeCostDetail>> {
  const scope = recipeIds
    ? and(eq(recipes.householdId, householdId), inArray(recipes.id, recipeIds))
    : eq(recipes.householdId, householdId)
  if (recipeIds && !recipeIds.length) return new Map()
  const rows = await db
    .select({
      recipeId: recipes.id,
      servings: recipes.servings,
      rawText: recipeIngredients.rawText,
      quantity: recipeIngredients.quantity,
      quantityMax: recipeIngredients.quantityMax,
      unitId: recipeIngredients.unitId,
    })
    .from(recipes)
    .innerJoin(recipeIngredients, eq(recipeIngredients.recipeId, recipes.id))
    .where(scope)
    .orderBy(asc(recipeIngredients.position))

  const { onHand } = await getHousehold(db, householdId)
  const atHome = onHandTest(onHand)
  const saved = await db
    .select({
      shop: storeProducts.shop,
      food: storeProducts.food,
      product: storeProducts.product,
    })
    .from(storeProducts)
    .where(
      and(
        eq(storeProducts.householdId, householdId),
        inArray(storeProducts.shop, PRICED_SHOPS)
      )
    )
  const products = new Map<string, { shop: ShopId; product: StoreProduct }>()
  for (const shop of [...PRICED_SHOPS].reverse()) {
    for (const row of saved) {
      if (row.shop === shop) products.set(row.food, row)
    }
  }

  // Headings ("For the sauce:") aren't ingredients.
  const lines = rows
    .filter((row) => !/:\s*$/.test(row.rawText))
    .map((row) => ({ row, food: lineFood(row.rawText) }))
  const needs = await needsFor(
    db,
    lines.map(({ row, food }) => ({
      quantity: row.quantityMax ?? row.quantity,
      unitId: row.unitId,
      name: food?.name ?? row.rawText,
      amountText: null,
    }))
  )

  const costs = new Map<string, RecipeCostDetail>()
  lines.forEach(({ row, food }, index) => {
    const cost = costs.get(row.recipeId) ?? {
      total: 0,
      perServing: null,
      priced: 0,
      counted: 0,
      lines: [],
    }
    costs.set(row.recipeId, cost)
    const line: RecipeCostLine = {
      text: row.rawText,
      product: null,
      shop: null,
      cost: null,
      sure: false,
      onHand: Boolean(food && atHome(food.name)),
    }
    cost.lines.push(line)
    if (!food || line.onHand) return
    cost.counted++
    const found = products.get(food.key)
    const price = found
      ? (found.product.salePrice ?? found.product.price)
      : null
    if (!found || price === null) return
    line.product = found.product.name
    line.shop = found.shop
    const share = shareOf(needs[index]!, parseProductSize(found.product.size))
    if (!share) return
    line.cost = round(share.share * price)
    line.sure = share.sure
    cost.total += line.cost
    cost.priced++
  })

  const servingsOf = new Map(rows.map((row) => [row.recipeId, row.servings]))
  for (const [id, cost] of costs) {
    cost.total = round(cost.total)
    const servings = servingsOf.get(id)
    cost.perServing = servings ? round(cost.total / servings) : null
  }
  return costs
}
