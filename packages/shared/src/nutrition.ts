import { z } from "zod"

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
