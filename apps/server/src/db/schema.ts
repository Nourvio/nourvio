import type {
  AiProviderId,
  AiTask,
  Appearance,
  CleanupJob,
  CleanupValues,
  Nutrition,
  ProposalStatus,
  RecipeInput,
  RecipeOrigin,
  RecipeVersion,
  Role,
  UnitKind,
} from "@mise/shared"
import { sql } from "drizzle-orm"
import {
  boolean,
  check,
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
  settings: jsonb().$type<{ autoCleanup?: boolean }>().notNull().default({}),
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
  id: text().primaryKey(),
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
    task: text().$type<AiTask>().notNull(),
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
    kind: text().$type<"cleanup">().notNull(),
    recipeId: uuid()
      .notNull()
      .references(() => recipes.id, { onDelete: "cascade" }),
    status: text().$type<ProposalStatus>().notNull(),
    payload: jsonb()
      .$type<{ summary: string; before: CleanupValues; after: CleanupValues }>()
      .notNull(),
    /** Set when part of a library run. */
    jobId: uuid().references(() => aiJobs.id, { onDelete: "set null" }),
    createdBy: uuid().references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    resolvedAt: timestamp({ withTimezone: true }),
  },
  (t) => [index().on(t.recipeId, t.status), index().on(t.status, t.createdAt)]
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
  kind: text().$type<"cleanup" | "mealie">().notNull(),
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
