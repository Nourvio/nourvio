import {
  avoidedIn,
  describeTastes,
  joinSections,
  type Substitute,
} from "@mise/shared"
import { desc, eq } from "drizzle-orm"
import { z } from "zod"

import type { AiActor, AiService } from "../ai/service.ts"
import type { Db } from "../db/client.ts"
import { recipeVersions } from "../db/schema.ts"
import { HttpError } from "../http.ts"
import { getHousehold } from "./households.ts"
import { listPantry } from "./pantry.ts"
import { recipeText } from "./proposals.ts"
import { getRecipe, toInput, updateRecipe } from "./recipes.ts"

const SWAP_SYSTEM = `Someone is about to cook this recipe and is out of one ingredient, or wants something else in its place. Suggest 2 to 4 substitutes that work in this recipe.
- Give each as ingredient lines with amounts for the recipe as written (the same servings), one ingredient per line, like "1 cup milk" and "1 tbsp lemon juice".
- Put what they have first: the pantry list is what's at home. Set inPantry for those.
- Never suggest anything the household avoids.
- The note is one short sentence on how to use it and how it changes the dish, like "Stir together and let sit 5 minutes; a little less tangy."
- Common, practical swaps; leave out anything hard to find.`

const swapResult = z.object({
  substitutes: z.array(
    z.object({
      lines: z.array(z.string()),
      note: z.string(),
      inPantry: z.boolean(),
    })
  ),
})

/** Substitutes for one ingredient of a recipe, knowing the pantry and the household's rules. */
export async function findSubstitutes(
  db: Db,
  ai: AiService,
  actor: AiActor & { householdId: string },
  idOrSlug: string,
  ingredientId: string
): Promise<Substitute[]> {
  const recipe = await getRecipe(db, actor.householdId, idOrSlug)
  const ingredient = recipe.ingredients.find((i) => i.id === ingredientId)
  if (!ingredient) {
    throw new HttpError(404, "That ingredient isn't in this recipe")
  }
  const [{ tastes }, pantry] = await Promise.all([
    getHousehold(db, actor.householdId),
    listPantry(db, actor.householdId),
  ])
  const rules = describeTastes(tastes)
  const result = await ai.extract("swap", actor, {
    system: SWAP_SYSTEM,
    parts: [
      {
        type: "text",
        text: [
          recipeText(toInput(recipe)),
          `Instead of: ${ingredient.text}`,
          `At home: ${pantry.map((item) => item.name).join(", ") || "(nothing listed)"}`,
          rules ? `The household's tastes and rules:\n${rules}` : null,
        ]
          .filter(Boolean)
          .join("\n\n"),
      },
    ],
    schema: swapResult,
    schemaName: "substitutes",
  })
  return result.substitutes
    .map((substitute) => ({
      lines: substitute.lines
        .map((line) => line.replace(/\s+/g, " ").trim().slice(0, 500))
        .filter(Boolean)
        .slice(0, 5),
      note: substitute.note.trim().slice(0, 300),
      inPantry: substitute.inPantry,
    }))
    .filter(
      (substitute) =>
        substitute.lines.length > 0 &&
        // Belt and braces: nothing the household avoids.
        avoidedIn(substitute.lines, tastes.avoid).length === 0
    )
    .slice(0, 4)
}

/**
 * Puts a substitute in the recipe for good, in the ingredient's place. The
 * version before stays in History, and its id comes back to undo with.
 */
export async function swapIngredient(
  db: Db,
  householdId: string,
  idOrSlug: string,
  input: { ingredientId: string; lines: string[] },
  userId: string
) {
  const recipe = await getRecipe(db, householdId, idOrSlug)
  if (!recipe.ingredients.some((i) => i.id === input.ingredientId)) {
    throw new HttpError(
      409,
      "That ingredient has changed since. Reload the recipe and try again."
    )
  }
  const [latest] = await db
    .select({ id: recipeVersions.id })
    .from(recipeVersions)
    .where(eq(recipeVersions.recipeId, recipe.id))
    .orderBy(desc(recipeVersions.createdAt))
    .limit(1)
  const ingredients = recipe.ingredients.flatMap((ingredient) =>
    ingredient.id === input.ingredientId
      ? input.lines.map((text) => ({ section: ingredient.section, text }))
      : [{ section: ingredient.section, text: ingredient.text }]
  )
  const updated = await updateRecipe(
    db,
    householdId,
    recipe.id,
    { ...toInput(recipe), ingredients: joinSections(ingredients) },
    { userId }
  )
  return {
    previous: recipe,
    recipe: updated,
    undoVersionId: latest?.id ?? null,
  }
}
