import { applyProposalInput } from "@mise/shared"
import { Hono } from "hono"

import { requireUser } from "../auth/middleware.ts"
import {
  currentHousehold,
  currentUser,
  type AppContext,
  type AppEnv,
} from "../context.ts"
import { readBody } from "../http.ts"
import type { NutritionService } from "../services/nutrition.ts"
import type { PhotoService } from "../services/photos.ts"
import {
  applyProposal,
  dismissProposal,
  getProposals,
  listPendingCleanups,
} from "../services/proposals.ts"
import { getRecipe } from "../services/recipes.ts"

/**
 * AI suggestions: the Review page's tidy-ups, and applying or dismissing any
 * proposal (tidy-ups, and chat's edits and new recipes).
 */
export function proposalsRoutes(
  { db }: AppContext,
  nutrition: NutritionService,
  photos: PhotoService
) {
  const app = new Hono<AppEnv>()
  app.use(requireUser)

  app.get("/", async (c) =>
    c.json({ proposals: await listPendingCleanups(db, currentHousehold(c)) })
  )

  app.post("/:id/apply", async (c) => {
    const input = await readBody(c, applyProposalInput)
    const householdId = currentHousehold(c)
    const [proposal] = await getProposals(db, householdId, [c.req.param("id")])
    const previous = proposal?.recipe
      ? await getRecipe(db, householdId, proposal.recipe.id).catch(() => null)
      : null
    const result = await applyProposal(
      db,
      householdId,
      c.req.param("id"),
      input,
      currentUser(c).id
    )
    if (result.recipe) {
      const actor = { userId: currentUser(c).id, householdId }
      // Saved as a new recipe: compare it with nothing.
      const same = previous?.id === result.recipe.id ? previous : null
      nutrition.afterSave(actor, result.recipe, same)
      if (!same) photos.afterCreate(actor, result.recipe)
    }
    return c.json(result)
  })

  app.post("/:id/dismiss", async (c) =>
    c.json({
      proposal: await dismissProposal(
        db,
        currentHousehold(c),
        c.req.param("id")
      ),
    })
  )

  return app
}
