import type { Appearance, Role } from "@mise/shared"
import { sql } from "drizzle-orm"
import {
  check,
  index,
  integer,
  jsonb,
  pgTable,
  real,
  text,
  timestamp,
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

export const users = pgTable(
  "users",
  {
    id: uuid().primaryKey().defaultRandom(),
    username: text().notNull().unique(),
    displayName: text().notNull(),
    passwordHash: text().notNull(),
    role: text().$type<Role>().notNull().default("member"),
    appearance: jsonb()
      .$type<Appearance>()
      .notNull()
      .default({ mode: "system", palette: "sage" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [check("users_role_check", sql`${t.role} in ('admin', 'member')`)]
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

export type UnitKind = "volume" | "weight" | "count"

/** Units of measure. Seeded at startup from reference-data.ts. */
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
