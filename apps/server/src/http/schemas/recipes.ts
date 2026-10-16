import { z } from "@hono/zod-openapi"
import { DIETS } from "@merran/shared"
import { RECIPE_ORIGINS } from "../../database/entities/index.ts"

const minutes = z.number().int().min(0).max(100_000).nullish()

const DietSchema = z.enum(DIETS).openapi("Diet")

/** The household's corrections to a recipe's diet labels: true adds one, false takes it away. */
const DietOverridesSchema = z
  .partialRecord(DietSchema, z.boolean())
  .openapi("DietOverrides")
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
    diets: z.array(DietSchema).openapi({
      description:
        "Diet labels worked out from the ingredients, with the household's corrections.",
    }),
    photo: z
      .object({
        full: z.string().openapi({ description: "For the recipe page." }),
        card: z.string().openapi({ description: "Cropped, for recipe cards." }),
      })
      .nullable()
      .openapi({
        description:
          "Where its photo is, in each size, or null. The links change with the photo, so they can be kept.",
      }),
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
  dietOverrides: DietOverridesSchema.openapi({
    description:
      "Where the household corrected the labels the ingredients suggest.",
  }),
  ingredients: z.array(IngredientSchema),
  steps: z.array(StepSchema),
}).openapi("Recipe")

export const RECIPE_SORTS = [
  "newest",
  "name",
  "updated",
  "rating",
  "made",
] as const

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
  diet: z
    .union([DietSchema, z.array(DietSchema)])
    .optional()
    .transform((value) => (value === undefined ? [] : [value].flat()))
    .openapi({
      description:
        "Only recipes with this diet label. Repeat it for all of several.",
    }),
  maxMinutes: z.coerce.number().int().min(1).max(100_000).optional().openapi({
    description: "Only recipes ready in this many minutes or fewer.",
  }),
  new: z.stringbool().optional().openapi({
    description: "Only recipes not made yet (true), or only ones made (false).",
  }),
  sort: z.enum(RECIPE_SORTS).default("newest").openapi({
    description:
      "Newest added, name, recently changed, top rated, or recently made.",
  }),
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

export const CookNoteSchema = z
  .object({
    id: z.string(),
    rating: z.number().nullable().openapi({ description: "1 to 5 stars." }),
    note: z.string().nullable().openapi({ description: "For next time." }),
    by: z
      .string()
      .nullable()
      .openapi({ description: "Who cooked it, if they're still here." }),
    createdAt: z.iso.datetime(),
  })
  .openapi("CookNote")

export const CookNoteInputSchema = z
  .object({
    rating: z
      .number()
      .int()
      .min(1)
      .max(5)
      .nullish()
      .transform((value) => value ?? null)
      .openapi({
        description: "1 to 5 stars. They become the recipe's rating.",
      }),
    note: z
      .string()
      .trim()
      .max(1000, "Keep the note under 1,000 characters.")
      .nullish()
      .transform((value) => value || null)
      .openapi({ description: "Anything to change next time." }),
  })
  .refine((input) => input.rating !== null || input.note !== null, {
    message: "Give it stars, a note, or both.",
  })
  .openapi("CookNoteInput")
export type CookNoteInput = z.infer<typeof CookNoteInputSchema>

export const CookNoteParam = RecipeParam.extend({
  noteId: z.string().openapi({ param: { name: "noteId", in: "path" } }),
})

export const DietsInputSchema = z
  .object({
    overrides: DietOverridesSchema.openapi({
      description:
        "The labels as they should be, where they differ from the ingredients. An empty object goes back to what the ingredients say.",
    }),
  })
  .openapi("DietsInput")

export const PairOptionSchema = z
  .object({
    id: z.string(),
    slug: z.string(),
    name: z.string(),
    photo: z
      .string()
      .nullable()
      .openapi({ description: "Its card-sized photo, or null." }),
    servings: z.number().nullable(),
    totalMinutes: z.number().nullable(),
  })
  .openapi("PairOption")

export const PairingSchema = z
  .discriminatedUnion("kind", [
    z.object({
      id: z.string(),
      kind: z.literal("recipe"),
      recipe: PairOptionSchema,
    }),
    z.object({
      id: z.string(),
      kind: z.literal("tag"),
      tag: z.string().openapi({ description: "Every recipe with this tag." }),
    }),
  ])
  .openapi("Pairing")

export const RecipePairingsSchema = z
  .object({
    pairings: z
      .array(PairingSchema)
      .openapi({ description: "What it goes with, as set." }),
    options: z.array(PairOptionSchema).openapi({
      description:
        "Every recipe that adds up to: picked ones first, then tagged ones by name.",
    }),
    pairsWith: z.array(PairOptionSchema).openapi({
      description: "Recipes it's offered with: the other way round.",
    }),
  })
  .openapi("RecipePairings")

export const PairingsInputSchema = z
  .object({
    recipes: z
      .array(z.string())
      .max(100, "Pick 100 recipes or fewer.")
      .optional()
      .openapi({ description: "Recipes it goes with, by id or slug." }),
    tag: z.string().trim().min(1).max(40).optional().openapi({
      description: "Or every recipe with this tag, now and later.",
    }),
  })
  .refine((input) => (input.recipes?.length ?? 0) > 0 || input.tag, {
    message: "Pick a recipe or a tag.",
  })
  .openapi("PairingsInput")
export type PairingsInput = z.infer<typeof PairingsInputSchema>

export const PairingParam = RecipeParam.extend({
  pairingId: z.string().openapi({ param: { name: "pairingId", in: "path" } }),
})

/** Recipes picked in select mode, by id. */
const BulkIds = z
  .array(z.uuid())
  .min(1, "Pick something first.")
  .max(500, "Up to 500 at a time.")

const BulkTags = z
  .array(z.string().trim().min(1).max(40, "Keep tags under 40 characters."))
  .min(1, "Name a tag.")
  .max(20, "Up to 20 tags at a time.")

export const RecipeBulkInputSchema = z
  .discriminatedUnion("action", [
    z.object({ action: z.literal("delete"), ids: BulkIds }).openapi({
      description: "To Recently deleted, for 30 days.",
    }),
    z.object({ action: z.literal("addTags"), ids: BulkIds, tags: BulkTags }),
    z.object({
      action: z.literal("removeTags"),
      ids: BulkIds,
      tags: BulkTags,
    }),
  ])
  .openapi("RecipeBulkInput")
export type RecipeBulkInput = z.infer<typeof RecipeBulkInputSchema>

export const DeletedBulkInputSchema = z
  .discriminatedUnion("action", [
    z.object({ action: z.literal("restore"), ids: BulkIds }).openapi({
      description: "Back where they were.",
    }),
    z.object({ action: z.literal("purge"), ids: BulkIds }).openapi({
      description: "Gone for good, photos and all.",
    }),
  ])
  .openapi("DeletedBulkInput")
export type DeletedBulkInput = z.infer<typeof DeletedBulkInputSchema>

export const BulkResultSchema = z
  .object({
    changed: z.number().openapi({
      description:
        "How many it changed. Ones not there, or already that way, are skipped.",
    }),
  })
  .openapi("BulkResult")

export const RatingInputSchema = z
  .object({
    rating: z.number().int().min(1).max(5).nullable().openapi({
      description: "From 1 to 5 stars, or null to clear it.",
    }),
  })
  .openapi("RecipeRatingInput")

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
