import { defineEntity, p, type InferEntity } from "@mikro-orm/core"
import { PROPOSAL_STATUSES, type TidyValues } from "@merran/shared"
import { householdFilter } from "../scope.ts"
import { createdAt, id } from "./base.ts"
import { householdRef } from "./households.ts"
import { Recipe } from "./recipes.ts"
import { User } from "./users.ts"

/** What a proposal changes. Tidy ups for now; the assistant's come later. */
export const PROPOSAL_KINDS = ["tidy"] as const

/**
 * A change the AI suggests, waiting in the Review queue for someone to
 * apply or dismiss: AI never changes a recipe by itself.
 */
export const Proposal = defineEntity({
  name: "Proposal",
  tableName: "proposals",
  properties: {
    id: id(),
    household: () => householdRef(),
    kind: p.enum(PROPOSAL_KINDS),
    recipe: () =>
      p.manyToOne(Recipe).ref().nullable().deleteRule("cascade").index(),
    status: p.enum(PROPOSAL_STATUSES),
    /** What it changes, in a sentence from the AI. */
    summary: p.text(),
    /** The sections it changes, as they were and as it suggests. */
    before: p.json<TidyValues>(),
    after: p.json<TidyValues>(),
    /** The library run that made it, if one did. */
    job: p.string().nullable(),
    createdBy: () => p.manyToOne(User).ref().nullable().deleteRule("set null"),
    createdAt: createdAt(),
    /** Who applied or dismissed it, and when. */
    resolvedBy: () => p.manyToOne(User).ref().nullable().deleteRule("set null"),
    resolvedAt: p.datetime().nullable(),
  },
  indexes: [{ properties: ["household", "status"] }],
  filters: householdFilter,
})
export type Proposal = InferEntity<typeof Proposal>
