import { z } from "zod"

export const ORIGINS = [
  "manual",
  "url",
  "text",
  "photo",
  "video",
  "chat",
  "mealie",
] as const
export type RecipeOrigin = (typeof ORIGINS)[number]

export const NUTRITION_SOURCES = ["site", "calculated", "estimate"] as const

/** Per serving. Grams, except sodium and cholesterol in milligrams. */
export const nutritionSchema = z.object({
  calories: z.number().min(0).nullable(),
  fat: z.number().min(0).nullable(),
  saturatedFat: z.number().min(0).nullable(),
  carbohydrates: z.number().min(0).nullable(),
  fiber: z.number().min(0).nullable(),
  sugar: z.number().min(0).nullable(),
  protein: z.number().min(0).nullable(),
  sodium: z.number().min(0).nullable(),
  cholesterol: z.number().min(0).nullable(),
  source: z.enum(NUTRITION_SOURCES),
})
export type Nutrition = z.infer<typeof nutritionSchema>

const minutes = z.number().int().min(0).max(100_000).nullish()
const optionalText = (max: number) => z.string().trim().max(max).nullish()

/**
 * What the editor and importers send. Ingredients and steps are lines, as in
 * the editor; a line starting with "#" starts a section.
 */
export const recipeInput = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Give the recipe a name")
    .max(200, "Keep the name under 200 characters"),
  description: optionalText(2000),
  servings: z
    .number()
    .positive("Servings must be more than 0")
    .max(1000)
    .nullish(),
  yieldText: optionalText(100),
  prepMinutes: minutes,
  cookMinutes: minutes,
  totalMinutes: minutes,
  notes: optionalText(5000),
  sourceUrl: z
    .union([z.url("Enter a full link, starting with https://"), z.literal("")])
    .nullish()
    .transform((value) => value || null),
  rating: z.number().int().min(1).max(5).nullish(),
  tags: z.array(z.string().trim().min(1).max(40)).max(30).default([]),
  ingredients: z.array(z.string().max(500)).max(300).default([]),
  steps: z.array(z.string().max(5000)).max(200).default([]),
  nutrition: nutritionSchema.nullish(),
})

export type RecipeInput = z.input<typeof recipeInput>
export type RecipeInputParsed = z.output<typeof recipeInput>

export type RecipeIngredient = {
  id: string
  section: string | null
  text: string
  quantity: number | null
  quantityMax: number | null
  unitId: string | null
  food: string | null
  note: string | null
}

export type RecipeStep = {
  id: string
  section: string | null
  text: string
}

export type RecipeSummary = {
  id: string
  slug: string
  name: string
  description: string | null
  imageUrl: string | null
  thumbnailUrl: string | null
  totalMinutes: number | null
  servings: number | null
  rating: number | null
  tags: string[]
  lastMadeAt: string | null
  createdAt: string
}

export type Recipe = RecipeSummary & {
  origin: RecipeOrigin
  sourceUrl: string | null
  yieldText: string | null
  prepMinutes: number | null
  cookMinutes: number | null
  notes: string | null
  nutrition: Nutrition | null
  ingredients: RecipeIngredient[]
  steps: RecipeStep[]
  updatedAt: string
}

export type RecipeVersion = {
  id: string
  source: "create" | "edit" | "ai_cleanup" | "chat" | "restore"
  createdAt: string
  createdBy: string | null
  name: string
}

export type Tag = { name: string; count: number }

export const rateInput = z.object({
  rating: z.number().int().min(1).max(5).nullable(),
})
