import type { Proposal, Recipe, RecipeValues } from "@mise/shared"
import { z } from "zod"

import type { AiService } from "../ai/service.ts"
import type { ChatToolSpec } from "../ai/types.ts"
import type { Db } from "../db/client.ts"
import { HttpError } from "../http.ts"
import { toRecipeInput } from "../import/ai-extract.ts"
import { proposeCleanup } from "../services/cleanup.ts"
import {
  cleanLines,
  createProposal,
  recipeText,
  sameList,
} from "../services/proposals.ts"
import {
  getRecipe,
  listRecipes,
  listTags,
  toInput,
} from "../services/recipes.ts"

export type ToolContext = {
  db: Db
  ai: AiService
  householdId: string
  userId: string
  conversationId: string
}

export type ToolResult = {
  /** What the model reads back. */
  output: string
  /** What the person sees, like "Read Chicken Tikka Masala". */
  label: string
  proposal?: Proposal
  isError?: boolean
}

type Tool<T extends z.ZodType> = {
  name: string
  description: string
  input: T
  /** Shown while it runs. */
  runningLabel: string
  run(ctx: ToolContext, input: z.output<T>): Promise<ToolResult>
}

const tool = <T extends z.ZodType>(definition: Tool<T>) => definition

const recipeRef = z
  .string()
  .describe("The recipe's id or slug, from search_recipes or the context")

async function findRecipe(ctx: ToolContext, ref: string) {
  try {
    return await getRecipe(ctx.db, ctx.householdId, ref.trim())
  } catch (error) {
    if (error instanceof HttpError && error.status === 404) return null
    throw error
  }
}

const notFound = (ref: string): ToolResult => ({
  output: `No recipe "${ref}" in this household's library. Search for it first.`,
  label: "Couldn't find that recipe",
  isError: true,
})

const PROPOSED =
  "The person now sees a card with these changes and can apply them with one tap. Nothing is saved until they do, so don't say it's saved."

const searchRecipes = tool({
  name: "search_recipes",
  description:
    "Search the household's recipe library by words (name, description, ingredients, tags) and/or one tag. Returns up to 20 matches with ids. Use null for both to list recent recipes.",
  input: z.object({
    query: z.string().nullable().describe('Words to look for, like "chicken"'),
    tag: z.string().nullable().describe("Only recipes with this tag"),
  }),
  runningLabel: "Searching recipes",
  async run(ctx, { query, tag }) {
    const found = await listRecipes(ctx.db, ctx.householdId, {
      q: query ?? undefined,
      tag: tag ?? undefined,
    })
    const results = found.slice(0, 20).map((recipe) => ({
      id: recipe.id,
      slug: recipe.slug,
      name: recipe.name,
      tags: recipe.tags,
      totalMinutes: recipe.totalMinutes,
      servings: recipe.servings,
      rating: recipe.rating,
      lastMade: recipe.lastMadeAt?.slice(0, 10) ?? null,
    }))
    return {
      output: JSON.stringify({ total: found.length, results }),
      label: query
        ? `Searched for "${query}"`
        : tag
          ? `Looked at ${tag} recipes`
          : "Looked through the recipes",
    }
  },
})

const getRecipeTool = tool({
  name: "get_recipe",
  description:
    "Read one recipe in full: ingredients, steps, times, servings, notes.",
  input: z.object({ recipe: recipeRef }),
  runningLabel: "Reading a recipe",
  async run(ctx, { recipe: ref }) {
    const recipe = await findRecipe(ctx, ref)
    if (!recipe) return notFound(ref)
    return {
      output: describeRecipe(recipe),
      label: `Read ${recipe.name}`,
    }
  },
})

const listTagsTool = tool({
  name: "list_tags",
  description: "The household's tags, with how many recipes have each.",
  input: z.object({}),
  runningLabel: "Checking tags",
  async run(ctx) {
    const tags = await listTags(ctx.db, ctx.householdId)
    return {
      output: JSON.stringify(tags.slice(0, 200)),
      label: "Checked the tags",
    }
  },
})

const proposeNewRecipe = tool({
  name: "propose_new_recipe",
  description:
    "Offer a recipe worked out in this conversation for saving to the library. The person sees a card and saves it with one tap. Write ingredients one per line with amounts and units, steps one per line.",
  input: z.object({
    summary: z
      .string()
      .describe(
        'One sentence for the card, like "A weeknight shakshuka for two."'
      ),
    name: z.string(),
    description: z.string().nullable(),
    servings: z.number().nullable(),
    prepMinutes: z.number().nullable(),
    cookMinutes: z.number().nullable(),
    totalMinutes: z.number().nullable(),
    ingredients: z
      .array(z.string())
      .describe(
        'Like "1 ½ cups all-purpose flour, sifted". "# Name" starts a group.'
      ),
    steps: z
      .array(z.string())
      .describe('One per line. "# Name" starts a group.'),
    tags: z
      .array(z.string())
      .describe("Up to 6, lowercase; reuse existing tags"),
    notes: z.string().nullable(),
  }),
  runningLabel: "Writing up the recipe",
  async run(ctx, { summary, ...draft }) {
    let recipe
    try {
      recipe = toRecipeInput({ found: true, yieldText: null, ...draft })
    } catch {
      return {
        output: "A recipe needs a name and at least some ingredients or steps.",
        label: "Couldn't draft the recipe",
        isError: true,
      }
    }
    const proposal = await createProposal(ctx.db, {
      householdId: ctx.householdId,
      kind: "new_recipe",
      recipeId: null,
      payload: {
        summary: summary.slice(0, 300),
        before: {},
        after: {},
        draft: recipe,
      },
      userId: ctx.userId,
      conversationId: ctx.conversationId,
    })
    return {
      output: PROPOSED,
      label: `Drafted ${recipe.name}`,
      proposal,
    }
  },
})

const proposeRecipeEdit = tool({
  name: "propose_recipe_edit",
  description: `Suggest changes to a recipe in the library, such as a substitution, a scaled batch or added notes. Give the full new list for any list you change, keeping its "# Section" lines and every line you aren't changing word for word; use null for anything that stays the same. The person can apply the changes to the recipe, or save them as a new recipe if you give a variantName.`,
  input: z.object({
    recipe: recipeRef,
    summary: z
      .string()
      .describe(
        'One sentence for the card, like "Swaps buttermilk for milk and lemon juice."'
      ),
    variantName: z
      .string()
      .nullable()
      .describe(
        'When the change makes a different version (dairy-free, half batch), its name as a new recipe, like "Buttermilk Pancakes (dairy-free)". Otherwise null.'
      ),
    name: z.string().nullable(),
    description: z.string().nullable(),
    servings: z.number().nullable(),
    ingredients: z.array(z.string()).nullable(),
    steps: z.array(z.string()).nullable(),
    tags: z.array(z.string()).nullable(),
    notes: z.string().nullable(),
  }),
  runningLabel: "Working out the changes",
  async run(ctx, input) {
    const recipe = await findRecipe(ctx, input.recipe)
    if (!recipe) return notFound(input.recipe)
    const { before, after } = editChanges(recipe, input)
    if (!Object.keys(after).length) {
      return {
        output:
          "Those values are the same as the recipe already has. Nothing to suggest.",
        label: `No changes for ${recipe.name}`,
        isError: true,
      }
    }
    const proposal = await createProposal(ctx.db, {
      householdId: ctx.householdId,
      kind: "recipe_edit",
      recipeId: recipe.id,
      payload: {
        summary: input.summary.slice(0, 300),
        before,
        after,
        variantName: input.variantName?.trim().slice(0, 200) || null,
      },
      userId: ctx.userId,
      conversationId: ctx.conversationId,
    })
    return {
      output: PROPOSED,
      label: `Suggested changes to ${recipe.name}`,
      proposal,
    }
  },
})

const tidyRecipe = tool({
  name: "tidy_recipe",
  description:
    "Run Mise's tidy-up on a recipe: cleaner ingredient lines and steps, tags, a missing description and missing times. The person reviews the suggestions on a card.",
  input: z.object({ recipe: recipeRef }),
  runningLabel: "Tidying a recipe",
  async run(ctx, { recipe: ref }) {
    const recipe = await findRecipe(ctx, ref)
    if (!recipe) return notFound(ref)
    const proposal = await proposeCleanup(
      ctx.db,
      ctx.ai,
      ctx.householdId,
      recipe.id,
      {
        userId: ctx.userId,
        sections: ["description", "tags", "details", "ingredients", "steps"],
        conversationId: ctx.conversationId,
      }
    )
    if (!proposal) {
      return {
        output: "The tidy-up found nothing worth changing.",
        label: `${recipe.name} is already tidy`,
      }
    }
    return {
      output: `${PROPOSED} The tidy-up's summary: ${proposal.summary}`,
      label: `Tidied ${recipe.name}`,
      proposal,
    }
  },
})

export const TOOLS = [
  searchRecipes,
  getRecipeTool,
  listTagsTool,
  proposeNewRecipe,
  proposeRecipeEdit,
  tidyRecipe,
] as Tool<z.ZodType>[]

/** The tools as each provider's adapter wants them: name, description, JSON schema. */
export function toolSpecs(): ChatToolSpec[] {
  return TOOLS.map((t) => {
    const schema = z.toJSONSchema(t.input) as Record<string, unknown>
    delete schema.$schema
    return { name: t.name, description: t.description, inputSchema: schema }
  })
}

export function findTool(name: string) {
  return TOOLS.find((t) => t.name === name)
}

/** A recipe as the model reads it, with its id and slug for tools. */
export function describeRecipe(recipe: Recipe) {
  return [
    `id: ${recipe.id}`,
    `slug: ${recipe.slug}`,
    recipeText(toInput(recipe)),
    recipe.rating ? `Rating: ${recipe.rating}/5` : null,
    recipe.lastMadeAt ? `Last made: ${recipe.lastMadeAt.slice(0, 10)}` : null,
  ]
    .filter(Boolean)
    .join("\n")
}

/** Before and after for each field the model gave that differs from the recipe. */
export function editChanges(
  recipe: Recipe,
  input: {
    name: string | null
    description: string | null
    servings: number | null
    ingredients: string[] | null
    steps: string[] | null
    tags: string[] | null
    notes: string | null
  }
) {
  const current = toInput(recipe)
  const before: RecipeValues = {}
  const after: RecipeValues = {}

  const name = input.name?.trim().slice(0, 200)
  if (name && name !== recipe.name) {
    before.name = recipe.name
    after.name = name
  }
  const description = input.description?.trim().slice(0, 2000)
  if (description && description !== recipe.description) {
    before.description = recipe.description
    after.description = description
  }
  const notes = input.notes?.trim().slice(0, 5000)
  if (notes && notes !== recipe.notes) {
    before.notes = recipe.notes
    after.notes = notes
  }
  if (
    input.servings !== null &&
    input.servings > 0 &&
    input.servings <= 1000 &&
    input.servings !== recipe.servings
  ) {
    const details = {
      servings: recipe.servings,
      prepMinutes: recipe.prepMinutes,
      cookMinutes: recipe.cookMinutes,
      totalMinutes: recipe.totalMinutes,
    }
    before.details = details
    after.details = { ...details, servings: input.servings }
  }
  if (input.tags) {
    const seen = new Set<string>()
    const tags = input.tags
      .map((tag) => tag.trim().toLowerCase())
      .filter(
        (tag) => tag && tag.length <= 30 && !seen.has(tag) && seen.add(tag)
      )
      .slice(0, 8)
    const had = recipe.tags.map((tag) => tag.toLowerCase())
    if (tags.length && !sameList([...tags].sort(), [...had].sort())) {
      before.tags = recipe.tags
      after.tags = tags
    }
  }
  for (const section of ["ingredients", "steps"] as const) {
    const proposed = input[section]
    if (!proposed) continue
    const lines =
      section === "ingredients"
        ? cleanLines(proposed, 300, 500)
        : cleanLines(proposed, 200, 5000)
    const now = current[section] ?? []
    if (lines.length && !sameList(lines, now)) {
      before[section] = now
      after[section] = lines
    }
  }
  return { before, after }
}
