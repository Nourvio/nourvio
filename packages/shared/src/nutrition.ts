import { z } from "zod"

import type { CleanupJob } from "./proposals.ts"

/** A household's library run, and what's left to do. */
export type NutritionLibrary = {
  job: CleanupJob | null
  /** Recipes with servings but no nutrition yet. */
  missing: number
  /** Recipes with no nutrition that need servings first. */
  noServings: number
}

/** Making photos for a household's recipes that have none. */
export type PhotoLibrary = {
  job: CleanupJob | null
  /** Recipes without a photo. */
  missing: number
  /** Photos can be made (an OpenAI key is set). */
  available: boolean
}

/** Roughly what one photo costs, in US dollars, for showing before a library run. */
export const PHOTO_COST_USD = 0.05

/** The server's USDA FoodData Central key, as Settings shows it. */
export type NutritionSettings = {
  usdaKey: {
    configured: boolean
    source: "env" | "settings" | null
    /** The last four characters. */
    hint: string | null
  }
}

export const updateNutritionSettingsInput = z.object({
  /** Null removes the saved key. */
  usdaKey: z
    .string()
    .trim()
    .min(10, "That key looks too short")
    .max(200)
    .nullable(),
})

export const testUsdaKeyInput = z.object({
  /** A key to try before saving; the saved one when left out. */
  usdaKey: z.string().trim().min(10).max(200).optional(),
})
