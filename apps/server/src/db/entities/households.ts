import { defineEntity, p, type InferEntity } from "@mikro-orm/core"
import { createdAt, id } from "./base.ts"

/** Planning settings a household reads and saves as a whole. */
export type HouseholdSettings = {
  meals?: ("breakfast" | "lunch" | "dinner" | "snack")[]
  alwaysOnHand?: string[]
  tastes?: Record<string, unknown>
  autoplan?: Record<string, unknown>
  themes?: Record<string, string>
  weeklyBudget?: { amount: number; currency: string } | null
}

/**
 * A household: Better Auth's organization. Better Auth writes the first five
 * columns; the rest are Merran's, so they need defaults or allow null.
 */
export const Household = defineEntity({
  name: "Household",
  tableName: "households",
  properties: {
    id: id(),
    name: p.string(),
    slug: p.string().unique(),
    logo: p.string().nullable(),
    metadata: p.text().nullable(),
    createdAt: createdAt(),
    /** ISO 3166 country, which decides stores, aisles and units offered. */
    country: p.string().length(2).nullable(),
    /** ISO 4217 currency for prices and budgets. */
    currency: p.string().length(3).nullable(),
    timeZone: p.string().default("UTC"),
    /** 0 is Sunday, 1 is Monday. */
    weekStartsOn: p.smallint().default(1),
    settings: p.json<HouseholdSettings>().nullable(),
  },
})
export type Household = InferEntity<typeof Household>

/**
 * The `household` property every household-owned entity has. Deleting a
 * household deletes everything in it.
 */
export const householdRef = () =>
  p.manyToOne(Household).ref().deleteRule("cascade").index()
