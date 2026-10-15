import type { NutrientKey, NutrientValues } from "@mise/shared"

import type { FdcPortion } from "../db/schema.ts"

/** A search result: a food the ingredient might be. */
export type FdcCandidate = { fdcId: number; description: string }

export type FdcFood = {
  fdcId: number
  description: string
  dataType: string
  /** Per 100 g. */
  nutrients: NutrientValues
  portions: FdcPortion[]
}

/** USDA FoodData Central, as Nourvio uses it. */
export interface FdcClient {
  /** Generic foods (Foundation and SR Legacy) that match, best first. */
  search(query: string): Promise<FdcCandidate[]>
  food(fdcId: number): Promise<FdcFood | null>
}

export type FdcClientFactory = (apiKey: string) => FdcClient

/** The key was refused. */
export class FdcKeyError extends Error {}

/** Too many requests this hour (1,000 on a normal key). */
export class FdcRateLimitError extends Error {}

const BASE = "https://api.nal.usda.gov/fdc/v1"

/**
 * FDC nutrient ids for each value, first found wins. Foundation foods report
 * energy as Atwater factors (2047, 2048) and sugars as 1063 rather than SR
 * Legacy's 1008 and 2000.
 */
const NUTRIENT_IDS: Record<NutrientKey, number[]> = {
  calories: [1008, 2047, 2048],
  fat: [1004],
  saturatedFat: [1258],
  carbohydrates: [1005],
  fiber: [1079],
  sugar: [2000, 1063],
  protein: [1003],
  sodium: [1093],
  cholesterol: [1253],
}

type RawNutrient = { nutrient?: { id?: number }; amount?: number }
type RawPortion = {
  amount?: number
  gramWeight?: number
  modifier?: string | null
  portionDescription?: string | null
  measureUnit?: { name?: string } | null
}

/** Reads the parts of an FDC food record that Nourvio uses. */
export function parseFood(raw: {
  fdcId: number
  description: string
  dataType: string
  foodNutrients?: RawNutrient[]
  foodPortions?: RawPortion[]
}): FdcFood {
  const amounts = new Map<number, number>()
  for (const n of raw.foodNutrients ?? []) {
    if (n.nutrient?.id && typeof n.amount === "number") {
      amounts.set(n.nutrient.id, n.amount)
    }
  }
  const nutrients = Object.fromEntries(
    Object.entries(NUTRIENT_IDS).map(([key, ids]) => [
      key,
      ids.map((id) => amounts.get(id)).find((v) => v !== undefined) ?? null,
    ])
  ) as NutrientValues

  const portions: FdcPortion[] = []
  for (const p of raw.foodPortions ?? []) {
    if (!p.gramWeight || p.gramWeight <= 0) continue
    const unit = p.measureUnit?.name
    const label = [
      unit && unit !== "undetermined" ? unit : null,
      p.modifier,
      p.portionDescription && p.portionDescription !== "Quantity not specified"
        ? p.portionDescription
        : null,
    ]
      .filter(Boolean)
      .join(", ")
    if (!label) continue
    portions.push({ label, amount: p.amount || 1, grams: p.gramWeight })
  }
  return {
    fdcId: raw.fdcId,
    description: raw.description,
    dataType: raw.dataType,
    nutrients,
    portions,
  }
}

export function createFdcClient(
  apiKey: string,
  fetchImpl: typeof fetch = fetch
): FdcClient {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async function call(path: string, init?: RequestInit): Promise<any> {
    // The key goes in a header, so it stays out of URLs and logs.
    const res = await fetchImpl(`${BASE}${path}`, {
      ...init,
      headers: { "content-type": "application/json", "x-api-key": apiKey },
      signal: AbortSignal.timeout(20_000),
    })
    if (res.status === 403 || res.status === 401) {
      throw new FdcKeyError("The USDA key was refused")
    }
    if (res.status === 429) {
      throw new FdcRateLimitError("Too many USDA requests for now")
    }
    if (res.status === 404) return null
    if (!res.ok) throw new Error(`USDA FoodData Central said ${res.status}`)
    return res.json()
  }

  return {
    async search(query) {
      const body = await call("/foods/search", {
        method: "POST",
        body: JSON.stringify({
          query,
          dataType: ["Foundation", "SR Legacy"],
          pageSize: 8,
        }),
      })
      const foods = (body?.foods ?? []) as {
        fdcId: number
        description: string
      }[]
      return foods.map((f) => ({ fdcId: f.fdcId, description: f.description }))
    },
    async food(fdcId) {
      const body = await call(`/food/${fdcId}`)
      return body ? parseFood(body) : null
    },
  }
}
