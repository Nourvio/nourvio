import {
  RECIPE_SECTION_NAMES,
  RECIPE_SECTIONS,
  type ApplyProposalInput,
  type Proposal,
  type ProposalKind,
  type ProposalStatus,
  type Recipe,
  type RecipeDetails,
  type RecipeInput,
  type RecipeSection,
  type RecipeValues,
} from "@mise/shared"
import { and, desc, eq, inArray } from "drizzle-orm"
import { alias } from "drizzle-orm/pg-core"
import { z } from "zod"

import type { Db } from "../db/client.ts"
import { proposals, recipes } from "../db/schema.ts"
import { HttpError } from "../http.ts"
import {
  createRecipe,
  findRecipeRow,
  getRecipe,
  toInput,
  updateRecipe,
} from "./recipes.ts"

type ProposalRow = typeof proposals.$inferSelect
type Payload = ProposalRow["payload"]

// ---- Comparing and describing recipes ----

/** A recipe as plain text, for the model to read. */
export function recipeText(input: RecipeInput) {
  const line = (label: string, value: unknown) =>
    value === null || value === undefined || value === ""
      ? `${label}: (none)`
      : `${label}: ${value}`
  return [
    line("Name", input.name),
    line("Description", input.description),
    line("Servings", input.servings),
    line("Yield", input.yieldText),
    line("Prep minutes", input.prepMinutes),
    line("Cook minutes", input.cookMinutes),
    line("Total minutes", input.totalMinutes),
    line("Tags", input.tags?.join(", ")),
    `Ingredients:\n${(input.ingredients ?? []).join("\n") || "(none)"}`,
    `Steps:\n${(input.steps ?? []).join("\n") || "(none)"}`,
    line("Notes", input.notes),
  ].join("\n")
}

export function cleanLines(lines: string[], max: number, maxLength: number) {
  return lines
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .slice(0, max)
    .map((line) => line.slice(0, maxLength))
}

export function sameList(a: string[], b: string[]) {
  return a.length === b.length && a.every((item, i) => item === b[i])
}

export function detailsOf(recipe: Recipe): RecipeDetails {
  return {
    servings: recipe.servings,
    prepMinutes: recipe.prepMinutes,
    cookMinutes: recipe.cookMinutes,
    totalMinutes: recipe.totalMinutes,
  }
}

/** Each section's current value, in the same shape a proposal stores. */
export function currentValue(recipe: Recipe, section: RecipeSection) {
  const input = toInput(recipe)
  switch (section) {
    case "name":
      return recipe.name
    case "description":
      return recipe.description
    case "tags":
      return recipe.tags
    case "details":
      return detailsOf(recipe)
    case "ingredients":
      return input.ingredients ?? []
    case "steps":
      return input.steps ?? []
    case "notes":
      return recipe.notes
  }
}

/** Writes the chosen sections' new values into editor input. */
function applyValues(
  input: RecipeInput,
  after: RecipeValues,
  sections: RecipeSection[]
) {
  for (const section of sections) {
    if (section === "details") Object.assign(input, after.details)
    else if (section === "name") input.name = after.name!
    else if (section === "description") input.description = after.description
    else if (section === "notes") input.notes = after.notes
    else if (section === "tags") input.tags = after.tags
    else input[section] = after[section]
  }
  return input
}

// ---- Storing and reading ----

const resultRecipes = alias(recipes, "result_recipes")

const columns = {
  proposal: proposals,
  recipe: { id: recipes.id, slug: recipes.slug, name: recipes.name },
  result: {
    id: resultRecipes.id,
    slug: resultRecipes.slug,
    name: resultRecipes.name,
  },
}

type Joined = {
  proposal: ProposalRow
  recipe: { id: string; slug: string; name: string } | null
  result: { id: string; slug: string; name: string } | null
}

function toProposal({ proposal, recipe, result }: Joined): Proposal {
  return {
    id: proposal.id,
    kind: proposal.kind,
    status: proposal.status,
    recipe,
    summary: proposal.payload.summary,
    before: proposal.payload.before,
    after: proposal.payload.after,
    draft: proposal.payload.draft ?? null,
    variantName: proposal.payload.variantName ?? null,
    result,
    createdAt: proposal.createdAt.toISOString(),
  }
}

function selectProposals(db: Db) {
  return db
    .select(columns)
    .from(proposals)
    .leftJoin(recipes, eq(proposals.recipeId, recipes.id))
    .leftJoin(resultRecipes, eq(proposals.resultRecipeId, resultRecipes.id))
}

export async function createProposal(
  db: Db,
  input: {
    householdId: string
    kind: ProposalKind
    recipeId: string | null
    status?: ProposalStatus
    payload: Payload
    userId: string | null
    jobId?: string | null
    conversationId?: string | null
  }
): Promise<Proposal> {
  const status = input.status ?? "pending"
  const [row] = await db
    .insert(proposals)
    .values({
      householdId: input.householdId,
      kind: input.kind,
      recipeId: input.recipeId,
      status,
      payload: input.payload,
      jobId: input.jobId ?? null,
      conversationId: input.conversationId ?? null,
      createdBy: input.userId,
      resolvedAt: status === "pending" ? null : new Date(),
    })
    .returning({ id: proposals.id })
  const [joined] = await selectProposals(db).where(eq(proposals.id, row!.id))
  return toProposal(joined!)
}

/** Tidy-up suggestions waiting for review, newest first, for the Review page. */
export async function listPendingCleanups(db: Db, householdId: string) {
  const rows = await selectProposals(db)
    .where(
      and(
        eq(proposals.householdId, householdId),
        eq(proposals.kind, "cleanup"),
        eq(proposals.status, "pending")
      )
    )
    .orderBy(desc(proposals.createdAt))
    .limit(200)
  return rows.map(toProposal)
}

/** The pending tidy-up for a recipe, if there is one. */
export async function pendingCleanupFor(
  db: Db,
  householdId: string,
  idOrSlug: string
) {
  const recipe = await findRecipeRow(db, householdId, idOrSlug)
  const [row] = await selectProposals(db)
    .where(
      and(
        eq(proposals.recipeId, recipe.id),
        eq(proposals.kind, "cleanup"),
        eq(proposals.status, "pending")
      )
    )
    .orderBy(desc(proposals.createdAt))
    .limit(1)
  return row ? toProposal(row) : null
}

/** Proposals by id, limited to the household. */
export async function getProposals(db: Db, householdId: string, ids: string[]) {
  if (!ids.length) return []
  const rows = await selectProposals(db).where(
    and(eq(proposals.householdId, householdId), inArray(proposals.id, ids))
  )
  return rows.map(toProposal)
}

async function findPending(db: Db, householdId: string, id: string) {
  const [row] = z.uuid().safeParse(id).success
    ? await selectProposals(db).where(
        and(eq(proposals.id, id), eq(proposals.householdId, householdId))
      )
    : []
  if (!row) throw new HttpError(404, "Those suggestions don't exist")
  if (row.proposal.status !== "pending") {
    throw new HttpError(409, "Those suggestions were already dealt with")
  }
  return row
}

function listNames(sections: RecipeSection[]) {
  const names = sections.map((section) => RECIPE_SECTION_NAMES[section])
  return names.length === 1
    ? names[0]!
    : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`
}

/**
 * Applies a proposal. A new recipe is saved; a change to a recipe applies the
 * chosen sections, either to the recipe itself or (`asNew`) to a copy saved
 * as a new recipe. A section the recipe has changed in since the suggestion
 * was made is refused rather than overwritten.
 */
export async function applyProposal(
  db: Db,
  householdId: string,
  id: string,
  options: ApplyProposalInput,
  userId: string | null
): Promise<{ recipe: Recipe; proposal: Proposal }> {
  const { proposal } = await findPending(db, householdId, id)
  let recipe: Recipe

  if (proposal.kind === "new_recipe") {
    const draft = proposal.payload.draft
    if (!draft) throw new HttpError(400, "That suggestion has no recipe in it")
    recipe = await createRecipe(db, householdId, draft, {
      origin: "chat",
      userId,
    })
  } else {
    const { before, after } = proposal.payload
    const chosen = RECIPE_SECTIONS.filter(
      (section) =>
        (options.sections ?? []).includes(section) && section in after
    )
    if (!chosen.length) {
      throw new HttpError(400, "None of those changes are in these suggestions")
    }
    const current = await getRecipe(db, householdId, proposal.recipeId!)
    const stale = chosen.filter(
      (section) =>
        JSON.stringify(currentValue(current, section)) !==
        JSON.stringify(before[section])
    )
    if (stale.length) {
      throw new HttpError(
        409,
        `${listNames(stale)} changed since these suggestions were made. Untick ${stale.length === 1 ? "it" : "them"} to keep the rest, or ask again.`
      )
    }
    const input = applyValues(toInput(current), after, chosen)
    if (options.asNew) {
      if (!chosen.includes("name")) {
        input.name = (
          proposal.payload.variantName || `${current.name} (variation)`
        ).slice(0, 200)
      }
      input.rating = null
      recipe = await createRecipe(db, householdId, input, {
        origin: "chat",
        userId,
        image: null,
      })
    } else {
      recipe = await updateRecipe(db, householdId, current.id, input, {
        userId,
        source: proposal.kind === "cleanup" ? "ai_cleanup" : "chat",
      })
    }
  }

  await db
    .update(proposals)
    .set({
      status: "applied",
      resolvedAt: new Date(),
      resultRecipeId: recipe.id,
    })
    .where(eq(proposals.id, proposal.id))
  const [updated] = await selectProposals(db).where(
    eq(proposals.id, proposal.id)
  )
  return { recipe, proposal: toProposal(updated!) }
}

export async function dismissProposal(db: Db, householdId: string, id: string) {
  const { proposal } = await findPending(db, householdId, id)
  await db
    .update(proposals)
    .set({ status: "dismissed", resolvedAt: new Date() })
    .where(eq(proposals.id, proposal.id))
  const [updated] = await selectProposals(db).where(
    eq(proposals.id, proposal.id)
  )
  return toProposal(updated!)
}
