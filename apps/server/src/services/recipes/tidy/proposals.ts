import type { MarkedLine, TidySection } from "@merran/shared"
import type { EntityManager } from "@mikro-orm/sql"
import { AppError } from "../../../core/errors.ts"
import { Proposal, User } from "../../../database/entities/index.ts"
import { findRecipe, updateRecipe } from "../recipes.ts"
import { describeProposal, detailsOf, tidyView } from "./tidy.ts"

// The Review queue: suggestions waiting to be applied, a section at a
// time, or dismissed. Applying goes through the recipe's own update, so it
// keeps a version and can be undone.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** What each section is called, in an error. */
const NAMES: Record<TidySection, string> = {
  ingredients: "ingredients",
  steps: "steps",
  tags: "tags",
  description: "description",
  details: "servings and times",
  marks: "marks",
}

/** "The steps", "The steps and tags", "The steps, tags and description". */
function listed(sections: TidySection[]) {
  const names = sections.map((section) => NAMES[section])
  const last = names.pop()!
  return `The ${names.length > 0 ? `${names.join(", ")} and ${last}` : last}`
}

/** The suggestions waiting, newest first, a page at a time. */
export async function listProposals(
  em: EntityManager,
  { limit = 50, offset = 0 }: { limit?: number; offset?: number } = {}
) {
  const [proposals, total] = await em.findAndCount(
    Proposal,
    { status: "pending", recipe: { deletedAt: null } },
    {
      populate: ["recipe"],
      orderBy: { createdAt: "desc", id: "desc" },
      limit,
      offset,
    }
  )
  return { proposals: proposals.map(describeProposal), total }
}

/** A recipe's waiting tidy up, or null. */
export async function recipeProposal(em: EntityManager, idOrSlug: string) {
  const recipe = await findRecipe(em, idOrSlug)
  const proposal = await em.findOne(
    Proposal,
    { recipe: recipe.id, kind: "tidy", status: "pending" },
    { populate: ["recipe"], orderBy: { createdAt: "desc" } }
  )
  return proposal ? describeProposal(proposal) : null
}

async function findPending(em: EntityManager, proposalId: string) {
  const proposal = UUID.test(proposalId)
    ? await em.findOne(Proposal, { id: proposalId }, { populate: ["recipe"] })
    : null
  if (!proposal) {
    throw new AppError(
      "not_found",
      "proposal_not_found",
      "There's no such suggestion."
    )
  }
  if (proposal.status !== "pending") {
    throw new AppError(
      "conflict",
      "proposal_resolved",
      `That suggestion was ${proposal.status} already.`
    )
  }
  return proposal
}

/** Values in a fixed order: Postgres keeps JSON objects' keys in its own. */
const sorted = (value: unknown): unknown =>
  Array.isArray(value)
    ? value.map(sorted)
    : value && typeof value === "object"
      ? Object.fromEntries(
          Object.entries(value)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([key, item]) => [key, sorted(item)])
        )
      : value

const same = (a: unknown, b: unknown) =>
  JSON.stringify(sorted(a)) === JSON.stringify(sorted(b))

/** Notes who applied or dismissed a suggestion, and when. */
function resolve(
  em: EntityManager,
  proposal: Proposal,
  status: "applied" | "dismissed",
  userId: string | null
) {
  proposal.status = status
  proposal.resolvedAt = new Date()
  proposal.resolvedBy = userId
    ? em.getReference(User, userId, { wrapped: true })
    : null
}

/**
 * Applies the sections of a suggestion that are chosen, as one change to
 * the recipe. A section changed since it was suggested is refused rather
 * than overwritten, and says which.
 */
export async function applyProposal(
  em: EntityManager,
  options: {
    householdId: string
    userId: string | null
    proposalId: string
    sections: readonly TidySection[]
  }
) {
  const proposal = await findPending(em, options.proposalId)
  const chosen = options.sections.filter((section) => section in proposal.after)
  if (chosen.length === 0) {
    throw new AppError(
      "invalid",
      "nothing_chosen",
      "Pick something to apply.",
      { sections: "Pick something to apply." }
    )
  }
  const recipe = await findRecipe(em, proposal.recipe!.id)
  const now = await tidyView(em, recipe)
  const { before, after } = proposal

  const current: Record<TidySection, unknown> = {
    ingredients: now.input.ingredients,
    steps: now.input.steps,
    tags: now.input.tags,
    description: now.input.description,
    details: detailsOf(now.input),
    marks: now.marks,
  }
  const changed = chosen.filter(
    (section) => !same(current[section], before[section])
  )
  if (changed.length > 0) {
    throw new AppError(
      "conflict",
      "proposal_outdated",
      `${listed(changed)} changed since this was suggested. Tidy it up again for new suggestions.`
    )
  }

  const input = { ...now.input }
  if (chosen.includes("ingredients")) input.ingredients = after.ingredients!
  if (chosen.includes("steps")) input.steps = after.steps!
  if (chosen.includes("tags")) input.tags = after.tags!
  if (chosen.includes("description")) {
    input.description = after.description ?? null
  }
  if (chosen.includes("details")) Object.assign(input, after.details)
  // Marks go on whichever lines it ends up with, by line or by food.
  const marks: MarkedLine[] | undefined = chosen.includes("marks")
    ? after.marks
    : undefined

  const updated = await updateRecipe(em, {
    householdId: options.householdId,
    userId: options.userId,
    recipe: recipe.id,
    input,
    source: "tidy",
    marks,
  })
  resolve(em, proposal, "applied", options.userId)
  await em.flush()
  return { proposal: describeProposal(proposal), recipe: updated }
}

/** Dismisses a suggestion, leaving the recipe as it is. */
export async function dismissProposal(
  em: EntityManager,
  options: { userId: string | null; proposalId: string }
) {
  const proposal = await findPending(em, options.proposalId)
  resolve(em, proposal, "dismissed", options.userId)
  await em.flush()
  return describeProposal(proposal)
}
