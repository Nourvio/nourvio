import { z } from "@hono/zod-openapi"
import { MEALS, PLAN_STATUSES } from "../../database/entities/index.ts"
import { IDS, TIMES } from "./examples.ts"

// The week plan: meals on days, and the week's pool for any day.

const Day = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a day written like "2026-10-15".')
  .openapi({ example: "2026-10-15" })

const MealSchema = z.enum(MEALS).openapi("Meal")
const StatusSchema = z.enum(PLAN_STATUSES).openapi("PlanStatus")

const PLAN_ENTRY = {
  id: IDS.planEntry,
  date: "2026-10-15",
  anyDay: false,
  meal: "dinner" as const,
  position: 0,
  status: "planned" as const,
  recipe: {
    id: IDS.lemonChicken,
    slug: "lemon-chicken",
    name: "Lemon Chicken",
    photo: null,
    servings: 4,
    totalMinutes: 50,
  },
  withRecipe: { id: IDS.garlicRice, slug: "garlic-rice", name: "Garlic Rice" },
  note: null,
  servings: null,
  createdAt: TIMES.now,
}

const SNAPSHOT = {
  id: IDS.planEntry,
  date: "2026-10-15",
  anyDay: false,
  meal: "dinner" as const,
  position: 0,
  status: "planned" as const,
  recipe: IDS.lemonChicken,
  withRecipe: IDS.garlicRice,
  note: null,
  servings: null,
  listedAt: null,
}

export const PlanEntrySchema = z
  .object({
    id: z.string(),
    date: Day.openapi({
      description: "Its day, or for the week's pool, the week's first day.",
    }),
    anyDay: z.boolean().openapi({
      description: "In the week's pool: for any day of the week.",
    }),
    meal: MealSchema,
    position: z.number().int().openapi({
      description: "Its place among the meal's dishes.",
    }),
    status: StatusSchema,
    recipe: z
      .object({
        id: z.string(),
        slug: z.string(),
        name: z.string(),
        photo: z.string().nullable(),
        servings: z.number().nullable(),
        totalMinutes: z.number().int().nullable(),
      })
      .nullable()
      .openapi({ description: "Null for a note." }),
    withRecipe: z
      .object({ id: z.string(), slug: z.string(), name: z.string() })
      .nullable()
      .openapi({ description: 'What it\'s made with: "with peanut sauce".' }),
    note: z
      .string()
      .nullable()
      .openapi({ description: 'A meal that isn\'t a recipe: "leftovers".' }),
    servings: z.number().nullable().openapi({
      description: "Null for the recipe's own servings.",
    }),
    createdAt: z.iso.datetime(),
  })
  .openapi("PlanEntry", { example: PLAN_ENTRY })

export const PlanEntrySnapshotSchema = z
  .object({
    id: z.uuid(),
    date: Day,
    anyDay: z.boolean(),
    meal: MealSchema,
    position: z.number().int().min(0),
    status: StatusSchema,
    recipe: z.string().nullable(),
    withRecipe: z.string().nullable(),
    note: z.string().max(200).nullable(),
    servings: z.number().positive().max(1000).nullable(),
    listedAt: z.iso.datetime().nullable(),
  })
  .openapi("PlanEntrySnapshot", {
    description:
      "A meal as it was, to put back with /plan/restore: what taking it off or changing it answers with.",
    example: SNAPSHOT,
  })

export const PlanSchema = z
  .object({ entries: z.array(PlanEntrySchema) })
  .openapi("Plan", { example: { entries: [PLAN_ENTRY] } })

export const PlanQuerySchema = z.object({
  from: Day.optional().openapi({
    param: { name: "from", in: "query" },
    description: "The first day. This week's first day if left out.",
  }),
  to: Day.optional().openapi({
    param: { name: "to", in: "query" },
    description: "The last day. Six days after `from` if left out.",
  }),
})

const note = z
  .string()
  .trim()
  .min(1, "Write what the meal is.")
  .max(200, "Keep the note under 200 characters.")
const servings = z
  .number()
  .positive("Use a number above 0.")
  .max(1000, "Use 1,000 or fewer.")

export const NewPlanEntrySchema = z
  .object({
    date: Day,
    meal: MealSchema,
    anyDay: z.boolean().optional().openapi({
      description: "For the week's pool: any day of the week `date` is in.",
    }),
    recipe: z.string().nullish().openapi({
      description: "The recipe, by id or address. Or give a note instead.",
    }),
    withRecipe: z.string().nullish().openapi({
      description: "A side or sauce it's made with, by id or address.",
    }),
    note: note.nullish(),
    servings: servings.nullish(),
  })
  .refine((entry) => !entry.recipe !== !entry.note, {
    message: "Give a recipe or a note.",
    path: ["recipe"],
  })
  .openapi("NewPlanEntry", {
    example: {
      date: "2026-10-15",
      meal: "dinner",
      recipe: "lemon-chicken",
      withRecipe: "garlic-rice",
    },
  })

export const PlanEntryChangesSchema = z
  .object({
    date: Day,
    meal: MealSchema,
    anyDay: z.boolean(),
    recipe: z.string().nullable().openapi({
      description:
        "Another recipe (Something else): it's planned afresh, its side kept.",
    }),
    withRecipe: z.string().nullable(),
    note: note.nullable(),
    servings: servings.nullable(),
    status: StatusSchema,
  })
  .partial()
  .openapi("PlanEntryChanges", {
    example: { date: "2026-10-16", status: "planned" },
  })

export const PlanEntryParam = z.object({
  entryId: z.uuid().openapi({ param: { name: "entryId", in: "path" } }),
})

export const PlanBulkSchema = z
  .object({
    ids: z.array(z.uuid()).min(1).max(200),
    action: z.enum(["remove", "move", "status"]),
    date: Day.optional().openapi({ description: "Where to move them." }),
    meal: MealSchema.optional().openapi({
      description: "The meal to move them to; their own if left out.",
    }),
    anyDay: z.boolean().optional().openapi({
      description: "Into the pool of the week `date` is in.",
    }),
    status: StatusSchema.optional(),
  })
  .refine((bulk) => bulk.action !== "move" || bulk.date !== undefined, {
    message: "Say where to move them.",
    path: ["date"],
  })
  .refine((bulk) => bulk.action !== "status" || bulk.status !== undefined, {
    message: "Say what they are now.",
    path: ["status"],
  })
  .openapi("PlanBulk", {
    example: { ids: [IDS.planEntry], action: "status", status: "cooked" },
  })

export const PlanBulkResultSchema = z
  .object({
    entries: z.array(PlanEntrySchema).openapi({
      description: "The meals as they are now; none when they were taken off.",
    }),
    before: z.array(PlanEntrySnapshotSchema).openapi({
      description: "The meals as they were, for Undo.",
    }),
  })
  .openapi("PlanBulkResult", {
    example: {
      entries: [{ ...PLAN_ENTRY, status: "cooked" as const }],
      before: [SNAPSHOT],
    },
  })

export const PlanWeekSchema = z
  .object({ week: Day.openapi({ description: "The week's first day." }) })
  .openapi("PlanWeek", { example: { week: "2026-10-11" } })

export const PlanClearedSchema = z
  .object({
    before: z.array(PlanEntrySnapshotSchema).openapi({
      description: "The meals taken off, for Undo.",
    }),
  })
  .openapi("PlanCleared", { example: { before: [SNAPSHOT] } })

export const PlanRestoreSchema = z
  .object({ entries: z.array(PlanEntrySnapshotSchema).min(1).max(500) })
  .openapi("PlanRestore", { example: { entries: [SNAPSHOT] } })

export const WhatsNextSchema = z
  .object({
    today: Day.openapi({ description: "Today, in the household's time zone." }),
    mealNow: MealSchema.openapi({
      description: "The meal of the hour: breakfast until 11, lunch until 3.",
    }),
    entry: PlanEntrySchema.nullable().openapi({
      description: "The next meal still planned, or null for none ahead.",
    }),
  })
  .openapi("WhatsNext", {
    example: { today: "2026-10-15", mealNow: "dinner", entry: PLAN_ENTRY },
  })
