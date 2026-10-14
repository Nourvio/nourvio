import type {
  HouseholdTastes,
  WebRecipeLink,
  DietOverrides,
  AiProviderId,
  AiUsageTask,
  Appearance,
  ChatPart,
  CleanupJob,
  ListSource,
  Meal,
  NutrientValues,
  Nutrition,
  PlanStatus,
  ProposalKind,
  ProposedMeal,
  ProposalStatus,
  RecipeInput,
  RecipeOrigin,
  RecipeValues,
  RecipeVersion,
  StoreSectionId,
  Role,
  UnitKind,
} from "@mise/shared"
import { sql } from "drizzle-orm"
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  real,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core"

// Column names come from the keys in snake_case (`casing: "snake_case"` in
// client.ts and drizzle.config.ts), so `displayName` is `display_name`.

const createdAt = () => timestamp({ withTimezone: true }).notNull().defaultNow()
const updatedAt = () =>
  timestamp({ withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date())

// ---- Accounts ----

/**
 * A household shares a recipe library (and later a plan, pantry and list).
 * Everything a household owns hangs off it and goes when it's deleted.
 */
export const households = pgTable("households", {
  id: uuid().primaryKey().defaultRandom(),
  name: text().notNull(),
  settings: jsonb()
    .$type<{
      autoCleanup?: boolean
      meals?: Meal[]
      weekStart?: 0 | 1
      onHand?: string[]
      tastes?: HouseholdTastes
    }>()
    .notNull()
    .default({}),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
})

export const users = pgTable(
  "users",
  {
    id: uuid().primaryKey().defaultRandom(),
    username: text().notNull().unique(),
    displayName: text().notNull(),
    passwordHash: text().notNull(),
    householdId: uuid()
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    /** Their role in the household. */
    role: text().$type<Role>().notNull().default("member"),
    /** Runs the server: AI keys, sign-up, other households, the Mealie import. */
    isServerAdmin: boolean().notNull().default(false),
    appearance: jsonb()
      .$type<Appearance>()
      .notNull()
      .default({ mode: "system", palette: "sage" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check("users_role_check", sql`${t.role} in ('admin', 'member')`),
    index().on(t.householdId),
  ]
)

/** Single-use invite links into a household. Only a hash of the token is kept. */
export const invites = pgTable(
  "invites",
  {
    id: uuid().primaryKey().defaultRandom(),
    householdId: uuid()
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    tokenHash: text().notNull().unique(),
    role: text().$type<Role>().notNull().default("member"),
    createdBy: uuid().references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    usedAt: timestamp({ withTimezone: true }),
    usedBy: uuid().references(() => users.id, { onDelete: "set null" }),
  },
  (t) => [index().on(t.householdId)]
)

/** Login sessions. `id` is a SHA-256 of the cookie token, so a database leak can't be replayed. */
export const sessions = pgTable(
  "sessions",
  {
    id: text().primaryKey(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    userAgent: text(),
    createdAt: createdAt(),
    lastSeenAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
  },
  (t) => [index().on(t.userId)]
)

/** App-wide settings as JSON, keyed by name (AI providers, cleanup options, ...). */
export const settings = pgTable("settings", {
  key: text().primaryKey(),
  value: jsonb().notNull(),
  updatedAt: updatedAt(),
})

// ---- Reference data ----

/** Units of measure. Seeded at startup from @mise/shared. */
export const units = pgTable(
  "units",
  {
    id: text().primaryKey(),
    name: text().notNull(),
    pluralName: text().notNull(),
    abbreviation: text(),
    aliases: text()
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    kind: text().$type<UnitKind>().notNull(),
    /** Millilitres per unit for volume, grams per unit for weight, null for counts. */
    toBase: real(),
  },
  (t) => [
    check("units_kind_check", sql`${t.kind} in ('volume', 'weight', 'count')`),
  ]
)

/** Aisles for grouping the shopping list. Seeded at startup from reference-data.ts. */
export const storeSections = pgTable("store_sections", {
  id: text().$type<StoreSectionId>().primaryKey(),
  name: text().notNull(),
  sortOrder: integer().notNull(),
})

// ---- Recipes ----

export const recipes = pgTable(
  "recipes",
  {
    id: uuid().primaryKey().defaultRandom(),
    householdId: uuid()
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    /** Unique within the household. */
    slug: text().notNull(),
    name: text().notNull(),
    description: text(),
    /** Base name of the stored photo in DATA_DIR/images (`<name>.webp` and `<name>-thumb.webp`). */
    image: text(),
    /** The photo was made by AI rather than taken. */
    imageAi: boolean().notNull().default(false),
    sourceUrl: text(),
    origin: text().$type<RecipeOrigin>().notNull().default("manual"),
    /** Where an imported recipe came from, e.g. "mealie:<id>", so re-imports don't duplicate. */
    externalRef: text(),
    servings: real(),
    yieldText: text(),
    prepMinutes: integer(),
    cookMinutes: integer(),
    totalMinutes: integer(),
    notes: text(),
    rating: smallint(),
    nutrition: jsonb().$type<Nutrition>(),
    /** Corrections to the diet labels the ingredients suggest. */
    dietOverrides: jsonb().$type<DietOverrides>().notNull().default({}),
    lastMadeAt: timestamp({ withTimezone: true }),
    createdBy: uuid().references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check(
      "recipes_rating_check",
      sql`${t.rating} is null or ${t.rating} between 1 and 5`
    ),
    index("recipes_name_trgm_index").using("gin", sql`${t.name} gin_trgm_ops`),
    uniqueIndex("recipes_household_slug_index").on(t.householdId, t.slug),
    uniqueIndex("recipes_household_external_ref_index").on(
      t.householdId,
      t.externalRef
    ),
    index().on(t.householdId, t.createdAt),
  ]
)

export const recipeIngredients = pgTable(
  "recipe_ingredients",
  {
    id: uuid().primaryKey().defaultRandom(),
    recipeId: uuid()
      .notNull()
      .references(() => recipes.id, { onDelete: "cascade" }),
    position: integer().notNull(),
    section: text(),
    /** The line as written. Shown as-is; the parsed fields below are helpers. */
    rawText: text().notNull(),
    quantity: real(),
    quantityMax: real(),
    unitId: text().references(() => units.id, { onDelete: "set null" }),
    food: text(),
    note: text(),
  },
  (t) => [index().on(t.recipeId, t.position)]
)

export const recipeSteps = pgTable(
  "recipe_steps",
  {
    id: uuid().primaryKey().defaultRandom(),
    recipeId: uuid()
      .notNull()
      .references(() => recipes.id, { onDelete: "cascade" }),
    position: integer().notNull(),
    section: text(),
    text: text().notNull(),
  },
  (t) => [index().on(t.recipeId, t.position)]
)

export const tags = pgTable(
  "tags",
  {
    id: uuid().primaryKey().defaultRandom(),
    householdId: uuid()
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    name: text().notNull(),
  },
  (t) => [
    uniqueIndex("tags_household_name_lower_index").on(
      t.householdId,
      sql`lower(${t.name})`
    ),
  ]
)

export const recipeTags = pgTable(
  "recipe_tags",
  {
    recipeId: uuid()
      .notNull()
      .references(() => recipes.id, { onDelete: "cascade" }),
    tagId: uuid()
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.recipeId, t.tagId] }), index().on(t.tagId)]
)

/**
 * What a recipe goes with: a particular recipe ("Teriyaki Sauce" with
 * "Chicken + Rice"), or every recipe with a tag ("any pasta sauce").
 */
export const recipePairings = pgTable(
  "recipe_pairings",
  {
    id: uuid().primaryKey().defaultRandom(),
    householdId: uuid()
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    recipeId: uuid()
      .notNull()
      .references(() => recipes.id, { onDelete: "cascade" }),
    pairedRecipeId: uuid().references(() => recipes.id, {
      onDelete: "cascade",
    }),
    /** A tag name, matched ignoring case, when it isn't one recipe. */
    tag: text(),
    createdAt: createdAt(),
  },
  (t) => [
    index().on(t.recipeId),
    index().on(t.pairedRecipeId),
    uniqueIndex("recipe_pairings_recipe_unique")
      .on(t.recipeId, t.pairedRecipeId)
      .where(sql`${t.pairedRecipeId} is not null`),
    uniqueIndex("recipe_pairings_tag_unique")
      .on(t.recipeId, sql`lower(${t.tag})`)
      .where(sql`${t.tag} is not null`),
  ]
)

/** Every saved state of a recipe, so any change (including an AI cleanup) can be undone. */
export const recipeVersions = pgTable(
  "recipe_versions",
  {
    id: uuid().primaryKey().defaultRandom(),
    recipeId: uuid()
      .notNull()
      .references(() => recipes.id, { onDelete: "cascade" }),
    snapshot: jsonb().$type<RecipeInput>().notNull(),
    source: text().$type<RecipeVersion["source"]>().notNull(),
    createdBy: uuid().references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [index().on(t.recipeId, t.createdAt)]
)

/** "How did it go?": a rating and a note left after cooking a recipe. */
export const cookNotes = pgTable(
  "cook_notes",
  {
    id: uuid().primaryKey().defaultRandom(),
    householdId: uuid()
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    recipeId: uuid()
      .notNull()
      .references(() => recipes.id, { onDelete: "cascade" }),
    userId: uuid().references(() => users.id, { onDelete: "set null" }),
    rating: smallint(),
    note: text(),
    createdAt: createdAt(),
  },
  (t) => [
    check(
      "cook_notes_rating_check",
      sql`${t.rating} is null or ${t.rating} between 1 and 5`
    ),
    index().on(t.recipeId, t.createdAt),
  ]
)

// ---- AI ----

/** One row per AI request, for the usage and cost summary in Settings. */
export const aiUsage = pgTable(
  "ai_usage",
  {
    id: uuid().primaryKey().defaultRandom(),
    /** Kept when a household goes, so the server's spending stays accurate. */
    householdId: uuid().references(() => households.id, {
      onDelete: "set null",
    }),
    userId: uuid().references(() => users.id, { onDelete: "set null" }),
    provider: text().$type<AiProviderId>().notNull(),
    model: text().notNull(),
    task: text().$type<AiUsageTask>().notNull(),
    inputTokens: integer().notNull(),
    outputTokens: integer().notNull(),
    /** Worked out when the request was made, from the prices then. */
    costUsd: real(),
    createdAt: createdAt(),
  },
  (t) => [index().on(t.createdAt)]
)

/**
 * A change the AI suggests, waiting for someone to apply or dismiss it. The
 * AI never edits a recipe directly.
 */
export const proposals = pgTable(
  "proposals",
  {
    id: uuid().primaryKey().defaultRandom(),
    householdId: uuid()
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    kind: text().$type<ProposalKind>().notNull(),
    /** The recipe it changes; null for a new recipe. */
    recipeId: uuid().references(() => recipes.id, { onDelete: "cascade" }),
    status: text().$type<ProposalStatus>().notNull(),
    payload: jsonb()
      .$type<{
        summary: string
        before: RecipeValues
        after: RecipeValues
        draft?: RecipeInput
        variantName?: string | null
        meals?: ProposedMeal[]
        items?: string[]
        tastes?: Partial<HouseholdTastes>
        fromNote?: string
        link?: WebRecipeLink
      }>()
      .notNull(),
    /** Set when part of a library run. */
    jobId: uuid().references(() => aiJobs.id, { onDelete: "set null" }),
    /** Set when suggested in a chat. */
    conversationId: uuid().references(() => chatConversations.id, {
      onDelete: "cascade",
    }),
    /** The recipe created or changed when it was applied. */
    resultRecipeId: uuid().references(() => recipes.id, {
      onDelete: "set null",
    }),
    createdBy: uuid().references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    resolvedAt: timestamp({ withTimezone: true }),
  },
  (t) => [
    index().on(t.recipeId, t.status),
    index().on(t.householdId, t.status, t.createdAt),
  ]
)

// ---- Meal plan ----

/** One recipe or note in a meal on a day. A meal can hold several (a main and a side). */
export const mealPlanEntries = pgTable(
  "meal_plan_entries",
  {
    id: uuid().primaryKey().defaultRandom(),
    householdId: uuid()
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    /** A calendar date in the household's own time. */
    date: date({ mode: "string" }).notNull(),
    meal: text().$type<Meal>().notNull(),
    position: integer().notNull().default(0),
    recipeId: uuid().references(() => recipes.id, { onDelete: "cascade" }),
    note: text(),
    /** Null means the recipe's own servings. */
    servings: real(),
    status: text().$type<PlanStatus>().notNull().default("planned"),
    /** When its ingredients went on the shopping list, so they're only added once. */
    listedAt: timestamp({ withTimezone: true }),
    /** Pantry rows as they were before cooking it used them, to put back. */
    pantryUsed: jsonb().$type<PantrySnapshot[]>(),
    /** What it's made with: a sauce or side the recipe goes with. */
    withRecipeId: uuid().references(() => recipes.id, { onDelete: "set null" }),
    createdBy: uuid().references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index().on(t.householdId, t.date)]
)

// ---- Shopping list ----

/** The household's shopping list: one list for now. */
export const shoppingItems = pgTable(
  "shopping_items",
  {
    id: uuid().primaryKey().defaultRandom(),
    householdId: uuid()
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    /** The normalized thing to buy (see foodKey), so later adds merge into it. */
    key: text().notNull(),
    name: text().notNull(),
    quantity: real(),
    unitId: text().references(() => units.id, { onDelete: "set null" }),
    /** A free-text amount ("2 × 12-pack") when it isn't a number and unit. */
    amountText: text(),
    sectionId: text()
      .$type<StoreSectionId>()
      .notNull()
      .default("other")
      .references(() => storeSections.id),
    checked: boolean().notNull().default(false),
    checkedAt: timestamp({ withTimezone: true }),
    source: text().$type<ListSource>().notNull(),
    /** Recipe names it's for. */
    recipes: jsonb().$type<string[]>().notNull().default([]),
    /** Planned meal ids it's for, carried into the pantry when put away. */
    entries: jsonb().$type<string[]>().notNull().default([]),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index().on(t.householdId, t.checked)]
)

/** Bought every week, whatever's planned (Diet Pepsi). Added with the plan. */
export const weeklyItems = pgTable(
  "weekly_items",
  {
    id: uuid().primaryKey().defaultRandom(),
    householdId: uuid()
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    name: text().notNull(),
    amount: text(),
    sectionId: text()
      .$type<StoreSectionId>()
      .notNull()
      .default("other")
      .references(() => storeSections.id),
    createdAt: createdAt(),
  },
  (t) => [index().on(t.householdId)]
)

/** Where the household shops for a food, learned when they move an item. */
export const foodSections = pgTable(
  "food_sections",
  {
    householdId: uuid()
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    food: text().notNull(),
    sectionId: text()
      .$type<StoreSectionId>()
      .notNull()
      .references(() => storeSections.id),
  },
  (t) => [primaryKey({ columns: [t.householdId, t.food] })]
)

// ---- Nutrition ----

/**
 * USDA FoodData Central foods we've used, cached for good: nutrients per
 * 100 g, and household portions ("1 medium" = 110 g) for converting amounts.
 * Shared by every household; it's public data.
 */
export const fdcFoods = pgTable("fdc_foods", {
  fdcId: integer().primaryKey(),
  description: text().notNull(),
  dataType: text().notNull(),
  nutrients: jsonb().$type<NutrientValues>().notNull(),
  portions: jsonb().$type<FdcPortion[]>().notNull().default([]),
  fetchedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
})

/**
 * Which USDA food an ingredient name means ("boneless chicken thigh" →
 * 2646171), and what one of a unit weighs when the USDA has no portion for
 * it ("each" → 120 g). A null fdc_id means nothing fit. Shared by every
 * household.
 */
export const foodMatches = pgTable("food_matches", {
  /** The food, with prep words dropped (see pantryKey). */
  food: text().primaryKey(),
  fdcId: integer(),
  /** Grams for one of a unit, by unit id or "each". */
  grams: jsonb().$type<Record<string, number>>().notNull().default({}),
  updatedAt: updatedAt(),
})

// ---- Pantry ----

/** A USDA household portion: "1 medium" weighs 110 g. */
export type FdcPortion = { label: string; amount: number; grams: number }

/** A pantry row before cooking a meal changed it, and whether it was removed. */
export type PantrySnapshot = {
  id: string
  key: string
  name: string
  quantity: number | null
  unitId: string | null
  amountText: string | null
  sectionId: StoreSectionId
  useBy: string | null
  entries: string[]
  removed: boolean
}

/** What the household has at home. Amounts are optional and can be rough. */
export const pantryItems = pgTable(
  "pantry_items",
  {
    id: uuid().primaryKey().defaultRandom(),
    householdId: uuid()
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    /** The food as the pantry matches it (see pantryKey). */
    key: text().notNull(),
    name: text().notNull(),
    quantity: real(),
    unitId: text().references(() => units.id, { onDelete: "set null" }),
    /** A rough amount ("half a bag") when it isn't a number and unit. */
    amountText: text(),
    sectionId: text()
      .$type<StoreSectionId>()
      .notNull()
      .default("other")
      .references(() => storeSections.id),
    useBy: date({ mode: "string" }),
    /** Planned meal ids it was bought for. */
    entries: jsonb().$type<string[]>().notNull().default([]),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index().on(t.householdId, t.key)]
)

// ---- Chat ----

/** A conversation with the assistant. Private to the person who started it. */
export const chatConversations = pgTable(
  "chat_conversations",
  {
    id: uuid().primaryKey().defaultRandom(),
    householdId: uuid()
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text().notNull(),
    /** A conversation stays on the provider and model it started with. */
    provider: text().$type<AiProviderId>().notNull(),
    model: text().notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index().on(t.userId, t.updatedAt)]
)

/**
 * One user message, or one whole assistant reply (which may span several
 * model calls and tool uses). `native` holds what the provider needs to
 * continue the conversation, in its own format; `parts` is what's shown.
 */
export const chatMessages = pgTable(
  "chat_messages",
  {
    id: uuid().primaryKey().defaultRandom(),
    conversationId: uuid()
      .notNull()
      .references(() => chatConversations.id, { onDelete: "cascade" }),
    position: integer().notNull(),
    role: text().$type<"user" | "assistant">().notNull(),
    parts: jsonb().$type<ChatPart[]>().notNull(),
    native: jsonb().$type<unknown[]>().notNull(),
    /** The recipe the user was looking at, for a user message. */
    contextLabel: text(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex().on(t.conversationId, t.position)]
)

/**
 * Long-running background work: tidying the whole library, or moving
 * recipes over from Mealie.
 */
export const aiJobs = pgTable("ai_jobs", {
  id: uuid().primaryKey().defaultRandom(),
  householdId: uuid()
    .notNull()
    .references(() => households.id, { onDelete: "cascade" }),
  kind: text().$type<"cleanup" | "mealie" | "nutrition" | "photos">().notNull(),
  status: text().$type<CleanupJob["status"]>().notNull(),
  total: integer().notNull(),
  done: integer().notNull().default(0),
  failed: integer().notNull().default(0),
  /** Already there, so left alone (Mealie import). */
  skipped: integer().notNull().default(0),
  createdBy: uuid().references(() => users.id, { onDelete: "set null" }),
  createdAt: createdAt(),
  finishedAt: timestamp({ withTimezone: true }),
})
