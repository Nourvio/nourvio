import {
  DIETS,
  isoDate,
  MEALS,
  toIsoDate,
  whyUseSoon,
  type Nutrition,
  type PantryItem,
  type PlanEntry,
  type Proposal,
  type ProposedMeal,
  type Recipe,
  type RecipeValues,
} from "@mise/shared"
import { z } from "zod"

import type { AiService } from "../ai/service.ts"
import type { ChatToolSpec } from "../ai/types.ts"
import type { Db } from "../db/client.ts"
import { HttpError } from "../http.ts"
import { toRecipeInput } from "../import/ai-extract.ts"
import { proposeCleanup } from "../services/cleanup.ts"
import { listItems } from "../services/list.ts"
import { getPairings } from "../services/pairings.ts"
import { listPantry } from "../services/pantry.ts"
import { listEntries } from "../services/plan.ts"
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
    "Search the household's recipe library by words (name, description, ingredients, tags), one tag, and/or a diet label (worked out from the ingredients). Returns up to 20 matches with ids. Use null for all three to list recent recipes.",
  input: z.object({
    query: z.string().nullable().describe('Words to look for, like "chicken"'),
    tag: z.string().nullable().describe("Only recipes with this tag"),
    diet: z
      .enum(DIETS)
      .nullable()
      .describe("Only recipes with this diet label"),
  }),
  runningLabel: "Searching recipes",
  async run(ctx, { query, tag, diet }) {
    const found = (
      await listRecipes(ctx.db, ctx.householdId, {
        q: query ?? undefined,
        tag: tag ?? undefined,
      })
    ).filter((recipe) => !diet || recipe.diets.includes(diet))
    const results = found.slice(0, 20).map((recipe) => ({
      id: recipe.id,
      slug: recipe.slug,
      name: recipe.name,
      tags: recipe.tags,
      diets: recipe.diets,
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

const getRecipePairings = tool({
  name: "get_recipe_pairings",
  description:
    "What a recipe goes with (sauces, sides), as set by the household, and what it's offered with. Use it to plan a meal with a sauce, or to suggest one.",
  input: z.object({ recipe: z.string().describe("The recipe's id or slug") }),
  runningLabel: "Checking what goes with it",
  async run(ctx, { recipe }) {
    const found = await findRecipe(ctx, recipe)
    if (!found) {
      return {
        output: "There's no recipe like that.",
        label: "Couldn't find that recipe",
        isError: true,
      }
    }
    const { options, pairsWith } = await getPairings(
      ctx.db,
      ctx.householdId,
      found.id
    )
    const list = (items: { name: string; slug: string }[]) =>
      items.map((i) => `${i.name} (${i.slug})`).join(", ") || "nothing yet"
    return {
      output: `${found.name} goes with: ${list(options)}.\nIt's offered with: ${list(pairsWith)}.`,
      label: `Checked what goes with ${found.name}`,
    }
  },
})

const getMealPlan = tool({
  name: "get_meal_plan",
  description:
    "The household's meal plan between two dates (YYYY-MM-DD, up to 62 days): each day's meals with their recipe or note, servings and whether it was cooked or skipped.",
  input: z.object({ from: isoDate, to: isoDate }),
  runningLabel: "Checking the plan",
  async run(ctx, { from, to }) {
    const entries = await listEntries(ctx.db, ctx.householdId, from, to)
    return { output: describePlan(entries), label: "Checked the plan" }
  },
})

const getPantry = tool({
  name: "get_pantry",
  description:
    "What the household has at home, with amounts where known, and what needs using soon (close to its use-by date, or bought for a meal that was skipped).",
  input: z.object({}),
  runningLabel: "Checking the pantry",
  async run(ctx) {
    const items = await listPantry(ctx.db, ctx.householdId)
    return { output: describePantry(items), label: "Checked the pantry" }
  },
})

const getShoppingList = tool({
  name: "get_shopping_list",
  description:
    "What's on the household's shopping list, by aisle, and what's checked off.",
  input: z.object({}),
  runningLabel: "Checking the list",
  async run(ctx) {
    const items = await listItems(ctx.db, ctx.householdId)
    const lines = items.map(
      (item) =>
        `${item.checked ? "[got] " : ""}${item.name}${item.amount ? ` (${item.amount})` : ""} [${item.sectionId}]`
    )
    return {
      output: lines.length ? lines.join("\n") : "The list is empty.",
      label: "Checked the list",
    }
  },
})

const proposeMeals = tool({
  name: "propose_meals",
  description:
    'Offer meals to add to the plan. The person sees a card and adds them with one tap. Use recipe ids or slugs from the library, or a note ("Leftovers", "Eating out") instead of a recipe.',
  input: z.object({
    summary: z
      .string()
      .describe(
        'One sentence for the card, like "Quick dinners for Monday to Thursday."'
      ),
    meals: z
      .array(
        z.object({
          date: isoDate,
          meal: z.enum(MEALS),
          recipe: z
            .string()
            .nullable()
            .describe("A recipe id or slug, or null with a note"),
          with: z
            .string()
            .nullable()
            .describe(
              "A recipe id or slug it's made with, like a sauce it goes with (see get_recipe_pairings), or null"
            ),
          note: z.string().nullable(),
          servings: z
            .number()
            .nullable()
            .describe("Null for the recipe's own servings"),
        })
      )
      .min(1)
      .max(28),
  }),
  runningLabel: "Planning meals",
  async run(ctx, { summary, meals }) {
    const resolved: ProposedMeal[] = []
    const missing: string[] = []
    for (const meal of meals) {
      if (meal.recipe) {
        const recipe = await findRecipe(ctx, meal.recipe)
        if (!recipe) {
          missing.push(meal.recipe)
          continue
        }
        const paired = meal.with ? await findRecipe(ctx, meal.with) : null
        resolved.push({
          date: meal.date,
          meal: meal.meal,
          recipe: { id: recipe.id, slug: recipe.slug, name: recipe.name },
          with:
            paired && paired.id !== recipe.id
              ? { id: paired.id, slug: paired.slug, name: paired.name }
              : null,
          note: null,
          servings: meal.servings && meal.servings > 0 ? meal.servings : null,
        })
      } else if (meal.note?.trim()) {
        resolved.push({
          date: meal.date,
          meal: meal.meal,
          recipe: null,
          with: null,
          note: meal.note.trim().slice(0, 200),
          servings: null,
        })
      }
    }
    if (!resolved.length) {
      return {
        output: `None of those recipes are in the library${missing.length ? ` (${missing.join(", ")})` : ""}. Search first.`,
        label: "Couldn't plan those",
        isError: true,
      }
    }
    const proposal = await createProposal(ctx.db, {
      householdId: ctx.householdId,
      kind: "plan_meals",
      recipeId: null,
      payload: {
        summary: summary.slice(0, 300),
        before: {},
        after: {},
        meals: resolved,
      },
      userId: ctx.userId,
      conversationId: ctx.conversationId,
    })
    return {
      output: `${PROPOSED}${missing.length ? ` Not found, so left out: ${missing.join(", ")}.` : ""}`,
      label: `Suggested ${resolved.length} ${resolved.length === 1 ? "meal" : "meals"}`,
      proposal,
    }
  },
})

const proposeListItems = tool({
  name: "propose_list_items",
  description:
    'Offer things to add to the shopping list, each as a line like "2 lb ground beef" or "paper towels". The person adds them with one tap.',
  input: z.object({
    summary: z.string().describe("One sentence for the card"),
    items: z.array(z.string()).min(1).max(40),
  }),
  runningLabel: "Writing a list",
  async run(ctx, { summary, items }) {
    const lines = items.map((item) => item.trim().slice(0, 200)).filter(Boolean)
    if (!lines.length) {
      return {
        output: "Those were all blank.",
        label: "Couldn't add those",
        isError: true,
      }
    }
    const proposal = await createProposal(ctx.db, {
      householdId: ctx.householdId,
      kind: "list_items",
      recipeId: null,
      payload: {
        summary: summary.slice(0, 300),
        before: {},
        after: {},
        items: lines,
      },
      userId: ctx.userId,
      conversationId: ctx.conversationId,
    })
    return {
      output: PROPOSED,
      label: `Suggested ${lines.length} ${lines.length === 1 ? "item" : "items"} for the list`,
      proposal,
    }
  },
})

export const TOOLS = [
  searchRecipes,
  getRecipeTool,
  listTagsTool,
  getRecipePairings,
  getMealPlan,
  getShoppingList,
  getPantry,
  proposeNewRecipe,
  proposeRecipeEdit,
  tidyRecipe,
  proposeMeals,
  proposeListItems,
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

/** The pantry as the model reads it: what needs using first, then the rest. */
export function describePantry(items: PantryItem[]) {
  if (!items.length) return "The pantry is empty."
  const today = toIsoDate(new Date())
  const line = (item: PantryItem) =>
    `${item.name}${item.amount ? ` (${item.amount})` : ""}`
  const soon = items.flatMap((item) => {
    const why = whyUseSoon(item, today)
    if (!why) return []
    const reason =
      why.kind === "leftover"
        ? `bought for ${why.meals.map((m) => m.name).join(", ")}, which ${why.meals[0]!.status === "skipped" ? "was skipped" : "wasn't cooked"}`
        : why.kind === "past"
          ? `past its use-by date, ${why.date}`
          : `use by ${why.date}`
    return [`${line(item)}: ${reason}`]
  })
  const rest = items.filter((item) => !whyUseSoon(item, today)).map(line)
  return [
    soon.length ? `Needs using soon:\n${soon.join("\n")}` : "",
    rest.length ? `Also at home:\n${rest.join("\n")}` : "",
  ]
    .filter(Boolean)
    .join("\n\n")
}

/** A plan, day by day, as the model reads it. */
export function describePlan(entries: PlanEntry[]) {
  if (!entries.length) return "Nothing planned."
  return entries
    .map((entry) => {
      const what = entry.recipe
        ? `${entry.recipe.name} (${entry.recipe.slug}${entry.servings ? `, ${entry.servings} servings` : ""})${entry.with ? ` with ${entry.with.name} (${entry.with.slug})` : ""}`
        : `Note: ${entry.note}`
      const status = entry.status === "planned" ? "" : ` [${entry.status}]`
      return `${entry.date} ${entry.meal}: ${what}${status}`
    })
    .join("\n")
}

/** A recipe as the model reads it, with its id and slug for tools. */
export function describeRecipe(recipe: Recipe) {
  return [
    `id: ${recipe.id}`,
    `slug: ${recipe.slug}`,
    recipeText(toInput(recipe)),
    recipe.rating ? `Rating: ${recipe.rating}/5` : null,
    recipe.lastMadeAt ? `Last made: ${recipe.lastMadeAt.slice(0, 10)}` : null,
    recipe.diets.length
      ? `Diet labels (from the ingredients, with the household's corrections): ${recipe.diets.join(", ")}`
      : null,
    recipe.nutrition ? describeNutrition(recipe.nutrition) : null,
  ]
    .filter(Boolean)
    .join("\n")
}

const NUTRITION_SOURCES: Record<Nutrition["source"], string> = {
  site: "from the recipe site",
  calculated: "calculated from USDA data",
  estimate: "an AI estimate",
}

function describeNutrition(nutrition: Nutrition) {
  const parts = [
    nutrition.calories !== null && `${nutrition.calories} kcal`,
    nutrition.protein !== null && `${nutrition.protein} g protein`,
    nutrition.carbohydrates !== null && `${nutrition.carbohydrates} g carbs`,
    nutrition.fat !== null && `${nutrition.fat} g fat`,
    nutrition.fiber !== null && `${nutrition.fiber} g fiber`,
    nutrition.sodium !== null && `${nutrition.sodium} mg sodium`,
  ].filter(Boolean)
  return parts.length
    ? `Nutrition per serving (${NUTRITION_SOURCES[nutrition.source]}): ${parts.join(", ")}`
    : null
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
