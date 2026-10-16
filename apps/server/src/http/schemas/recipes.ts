import { z } from "@hono/zod-openapi"
import { RECIPE_ORIGINS } from "../../database/entities/index.ts"

const minutes = z.number().int().min(0).max(100_000).nullish()
const text = (max: number, message: string) =>
  z
    .string()
    .trim()
    .max(max, message)
    .nullish()
    .transform((value) => value || null)

/**
 * A recipe as the editor and the API write it. Ingredients and steps are
 * lines, one each; a line starting with "#" starts a section.
 */
export const RecipeInputSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, "Give the recipe a name.")
      .max(200, "Keep the name under 200 characters."),
    description: text(2000, "Keep it under 2,000 characters."),
    servings: z
      .number()
      .positive("Use a number above 0.")
      .max(1000, "Use 1,000 or fewer.")
      .nullish()
      .transform((value) => value ?? null),
    yieldText: text(100, "Keep it under 100 characters.").openapi({
      description: 'What it makes, when that isn\'t servings: "2 loaves".',
    }),
    prepMinutes: minutes.transform((value) => value ?? null),
    cookMinutes: minutes.transform((value) => value ?? null),
    totalMinutes: minutes.transform((value) => value ?? null),
    notes: text(5000, "Keep the notes under 5,000 characters."),
    sourceUrl: z
      .union([
        z.url({
          protocol: /^https?$/,
          error: "Use a full link, starting with https://",
        }),
        z.literal(""),
      ])
      .nullish()
      .transform((value) => value || null),
    rating: z
      .number()
      .int()
      .min(1)
      .max(5)
      .nullish()
      .transform((value) => value ?? null),
    tags: z
      .array(z.string().trim().min(1).max(40, "Keep tags under 40 characters."))
      .max(30, "Use 30 tags or fewer.")
      .default([]),
    ingredients: z
      .array(z.string().max(500, "Keep each line under 500 characters."))
      .max(300, "Use 300 lines or fewer.")
      .default([])
      .openapi({ example: ["# Dough", "2 cups flour", "1 tsp salt"] }),
    steps: z
      .array(z.string().max(5000, "Keep each step under 5,000 characters."))
      .max(200, "Use 200 steps or fewer.")
      .default([]),
  })
  .openapi("RecipeInput")

export type RecipeInput = z.output<typeof RecipeInputSchema>

export const RecipeSummarySchema = z
  .object({
    id: z.string(),
    slug: z.string().openapi({ example: "lemon-chicken" }),
    name: z.string(),
    description: z.string().nullable(),
    servings: z.number().nullable(),
    totalMinutes: z.number().nullable().openapi({
      description: "As given, or prep and cook added up.",
    }),
    rating: z.number().nullable(),
    tags: z.array(z.string()),
    lastMadeAt: z.iso.datetime().nullable(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .openapi("RecipeSummary")

export const IngredientSchema = z
  .object({
    id: z.string(),
    section: z.string().nullable(),
    text: z.string().openapi({ description: "The line as written." }),
    quantity: z.number().nullable(),
    quantityMax: z.number().nullable(),
    unit: z.string().nullable().openapi({ example: "tablespoon" }),
    food: z.string().nullable(),
    note: z.string().nullable(),
  })
  .openapi("Ingredient")

export const StepSchema = z
  .object({
    id: z.string(),
    section: z.string().nullable(),
    text: z.string(),
  })
  .openapi("Step")

export const RecipeSchema = RecipeSummarySchema.extend({
  origin: z.enum(RECIPE_ORIGINS),
  sourceUrl: z.string().nullable(),
  yieldText: z.string().nullable(),
  prepMinutes: z.number().nullable(),
  cookMinutes: z.number().nullable(),
  notes: z.string().nullable(),
  ingredients: z.array(IngredientSchema),
  steps: z.array(StepSchema),
}).openapi("Recipe")

export const RECIPE_SORTS = ["newest", "name", "updated", "rating"] as const

export const RecipeListQuerySchema = z.object({
  q: z
    .string()
    .trim()
    .max(200)
    .optional()
    .openapi({ description: "Words in the name, description or ingredients." }),
  tag: z
    .union([z.string(), z.array(z.string())])
    .optional()
    .transform((value) => (value === undefined ? [] : [value].flat()))
    .openapi({
      description: "Only recipes with this tag. Repeat it for all of several.",
    }),
  sort: z.enum(RECIPE_SORTS).default("newest"),
  limit: z.coerce.number().int().min(1).max(100).default(48),
  offset: z.coerce.number().int().min(0).default(0),
})

export const RecipeListSchema = z
  .object({
    recipes: z.array(RecipeSummarySchema),
    total: z.number().openapi({ description: "How many match, in all." }),
  })
  .openapi("RecipeList")

export const RecipeParam = z.object({
  recipe: z.string().openapi({
    param: { name: "recipe", in: "path" },
    description: "The recipe's id, or its slug.",
    example: "lemon-chicken",
  }),
})

export const VersionSchema = z
  .object({
    id: z.string(),
    source: z.enum(["import", "edit", "tidy", "assistant", "swap", "restore"]),
    name: z.string().openapi({ description: "The recipe's name then." }),
    createdBy: z.string().nullable(),
    createdAt: z.iso.datetime(),
  })
  .openapi("RecipeVersion")

export const VersionParam = RecipeParam.extend({
  versionId: z.string().openapi({ param: { name: "versionId", in: "path" } }),
})

export const DeletedRecipeSchema = RecipeSummarySchema.extend({
  deletedAt: z.iso.datetime(),
  goneAt: z.iso
    .datetime()
    .openapi({ description: "When it's deleted for good." }),
}).openapi("DeletedRecipe")

export const DeletedRecipeParam = z.object({
  recipeId: z.string().openapi({ param: { name: "recipeId", in: "path" } }),
})

export const TagSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    recipes: z.number().openapi({ description: "How many recipes have it." }),
  })
  .openapi("Tag")

export const TagParam = z.object({
  tagId: z.string().openapi({ param: { name: "tagId", in: "path" } }),
})

export const TagChangesSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, "Give the tag a name.")
      .max(40, "Keep tags under 40 characters.")
      .openapi({
        description: "A name another tag already has merges the two.",
      }),
  })
  .openapi("TagChanges")
