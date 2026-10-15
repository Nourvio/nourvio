import { addDays, daysBetween } from "./plan.ts"
import type { StoreSectionId } from "./stores.ts"

/** How much Fill the week and the weekly autopilot lean on what's on sale. */
export const SALE_LEANS = ["off", "some", "lots"] as const
export type SaleLean = (typeof SALE_LEANS)[number]

export const SALE_LEAN_NAMES: Record<SaleLean, string> = {
  off: "Off",
  some: "A little",
  lots: "A lot",
}

/** A food in the household's recipes that's on sale at its Fry's. */
export type Deal = {
  /** The food, as Nourvio matches it (see foodKey): "chicken thigh". */
  key: string
  /** The product that's on sale. */
  product: string
  price: number
  salePrice: number
  /** The sale's last day, when the store says. */
  saleEnds: string | null
  section: StoreSectionId
}

/** Something a recipe uses that's on sale, named as the recipe has it. */
export type OnSale = {
  /** "chicken thighs" */
  food: string
  key: string
  price: number
  salePrice: number
}

/** This week's sales at the household's Fry's, and the recipes they're in. */
export type Deals = {
  /** "Fry's", or null without a store picked. */
  storeName: string | null
  /** When prices were last checked. */
  checkedAt: string | null
  deals: Deal[]
  /** Recipe id → what it uses that's on sale. */
  recipes: Record<string, OnSale[]>
}

/** What came of checking prices. */
export type PriceCheck = {
  /** Remembered products whose price was refreshed. */
  refreshed: number
  /** Recipe foods looked up at the store: new ones, and Nourvio's picks taking a fresh look for a sale. */
  searched: number
  /** Foods in the household's recipes on sale now. */
  onSale: number
}

// Meat and seafood sales change what's for dinner; produce, a bit.
const SECTION_NUDGE: Partial<Record<StoreSectionId, number>> = {
  "meat-seafood": 1,
  produce: 0.4,
}
const LEAN_FACTOR: Record<SaleLean, number> = { off: 0, some: 1, lots: 2.5 }
const LEAN_CAP: Record<SaleLean, number> = { off: 0, some: 1.5, lots: 4 }

/**
 * How much more likely a recipe is to be suggested for what it uses that's
 * on sale. "A little" is about what a good rating adds, so a favorite still
 * beats a so-so recipe with cheap chicken; "a lot" usually wins.
 */
export function saleNudge(sections: StoreSectionId[], lean: SaleLean) {
  const total = sections.reduce(
    (sum, section) => sum + (SECTION_NUDGE[section] ?? 0.2),
    0
  )
  return Math.min(total * LEAN_FACTOR[lean], LEAN_CAP[lean])
}

/** A product's regular price on a day it was seen. */
export type PriceSeen = { day: string; price: number | null }

/**
 * What a product usually costs: its most common regular price over the past
 * 90 days, once it's been seen on a few days at least two weeks apart.
 * Ties go to the most recent.
 */
export function usualPrice(seen: PriceSeen[], today: string) {
  const from = addDays(today, -90)
  const recent = seen
    .filter(
      (row): row is { day: string; price: number } =>
        row.price !== null && row.day >= from && row.day <= today
    )
    .sort((a, b) => a.day.localeCompare(b.day))
  if (recent.length < 3) return null
  if (daysBetween(recent[0]!.day, recent.at(-1)!.day) < 14) return null
  const counts = new Map<number, { count: number; last: string }>()
  for (const row of recent) {
    const cents = Math.round(row.price * 100)
    const found = counts.get(cents)
    counts.set(cents, { count: (found?.count ?? 0) + 1, last: row.day })
  }
  let best: [number, { count: number; last: string }] | null = null
  for (const entry of counts) {
    if (
      !best ||
      entry[1].count > best[1].count ||
      (entry[1].count === best[1].count && entry[1].last > best[1].last)
    ) {
      best = entry
    }
  }
  return best ? best[0] / 100 : null
}

/**
 * The usual price, when it's worth saying: what's paid now (the sale price
 * when there is one) is at least 5% under it.
 */
export function usualWorthShowing(
  product: { price: number | null; salePrice: number | null },
  usual: number | null
) {
  const paid = product.salePrice ?? product.price
  return usual !== null && paid !== null && paid <= usual * 0.95 ? usual : null
}
