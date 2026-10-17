import { judgeSale, priceNow, worthIt, type SaleJudged } from "@merran/shared"
import type { EntityManager } from "@mikro-orm/sql"
import type { AppDeps } from "../../core/context.ts"
import { StoreProduct } from "../../database/entities/index.ts"
import { householdToday } from "../pantry/pantry.ts"
import { foodOf, itemsToGet, lineFor } from "./basket.ts"
import { KROGER, krogerConnection } from "./connections.ts"
import { priceHistory } from "./history.ts"
import { krogerApp } from "./kroger.ts"

// What the things on the list cost at the household's Kroger store, from
// the product it keeps for each food and the last price seen for it: no
// look at the store, so the list can ask every time it's opened.

export type ItemPrice = {
  /** For the packages needed, at the sale price when there's a sale. */
  total: number
  packages: number
  /** How many is worked out from the product's size, not a guess. */
  sure: boolean
  /** A real deal (not barely off), with what it takes off. */
  sale: {
    verdict: "lowest" | "sale"
    /** Off the packages needed, in cents. */
    saved: number
    /** Its last day, when the store says. */
    ends: string | null
  } | null
  /** What a package usually costs, when it's on sale. */
  usual: number | null
  /** The product it's priced from: "Kroger 2% Milk". */
  product: string
  /** The day that price was seen. */
  seenOn: string
}

/**
 * The prices of what's left to get on the list for Kroger, by item id.
 * Things with no product kept for them, or no price, are left out.
 */
export async function listPrices(
  deps: Pick<AppDeps, "settings">,
  em: EntityManager,
  householdId: string
) {
  const items: Record<string, ItemPrice> = {}
  const connection = await krogerConnection(em)
  if (!connection?.location || !(await krogerApp(deps.settings))) {
    return { store: null, currency: "USD", items }
  }
  const toGet = await itemsToGet(em)
  const kept = new Map(
    (
      await em.find(StoreProduct, {
        store: KROGER,
        food: { $in: [...new Set(toGet.map(foodOf))] },
      })
    ).map((row) => [row.food, row])
  )
  const products = [...kept.values()].map((row) => row.product)
  const today = await householdToday(em, householdId)
  const history = await priceHistory(
    em,
    products.map((product) => product.id),
    today
  )
  const sales = new Map<string, SaleJudged>()
  for (const product of products) {
    const sale = judgeSale(product, history.get(product.id) ?? [], today)
    if (sale) sales.set(product.id, sale)
  }
  let currency: string | null = null

  for (const item of toGet) {
    const row = kept.get(foodOf(item))
    const line = lineFor(item, row, connection, sales)
    if (!row || !line.product) continue
    const now = priceNow(line.product, today)
    if (now.price === null) continue
    currency ??= line.product.currency
    const real = line.sale && worthIt(line.sale.verdict) ? line.sale : null
    const regular = now.regular ?? now.price
    items[item.id] = {
      total: now.price * line.packages,
      packages: line.packages,
      sure: line.sure,
      sale: real
        ? {
            verdict: real.verdict === "lowest" ? "lowest" : "sale",
            saved: Math.max(0, regular - now.price) * line.packages,
            ends: line.product.saleEnds,
          }
        : null,
      usual: line.sale?.usual ?? null,
      product: line.product.name,
      seenOn:
        history.get(line.product.id)?.at(-1)?.day ??
        row.updatedAt.toISOString().slice(0, 10),
    }
  }
  return {
    store: connection.location.banner,
    currency: currency ?? "USD",
    items,
  }
}
