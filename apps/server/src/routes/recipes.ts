import {
  addCookNoteInput,
  addPairingsInput,
  CLEANUP_SECTIONS,
  cleanupInput,
  isoDate,
  rateInput,
  recipeBulkInput,
  recipeInput,
  renameTagInput,
  setDietsInput,
  substitutesInput,
  swapIngredientInput,
} from "@mise/shared"
import { Hono } from "hono"
import { bodyLimit } from "hono/body-limit"

import type { AiService } from "../ai/service.ts"
import type { NutritionService } from "../services/nutrition.ts"
import type { PhotoService } from "../services/photos.ts"
import { requireUser } from "../auth/middleware.ts"
import {
  currentHousehold,
  currentUser,
  type AppContext,
  type AppEnv,
} from "../context.ts"
import { HttpError, readBody } from "../http.ts"
import { proposeCleanup } from "../services/cleanup.ts"
import { recipeCosts } from "../services/costs.ts"
import {
  addPairings,
  getPairings,
  removePairing,
} from "../services/pairings.ts"
import { markPlannedCooked } from "../services/plan.ts"
import {
  addCookNote,
  deleteCookNote,
  listCookNotes,
} from "../services/cook-notes.ts"
import { pendingSuggestionFor } from "../services/proposals.ts"
import { findSubstitutes, swapIngredient } from "../services/swaps.ts"
import { deleteImage, saveImage } from "../services/images.ts"
import {
  createRecipe,
  deleteRecipe,
  deleteRecipes,
  deleteTag,
  findRecipeRow,
  getRecipe,
  listDeletedRecipes,
  listRecipes,
  listTags,
  listVersions,
  purgeRecipes,
  renameTag,
  restoreRecipes,
  restoreVersion,
  setRecipeFields,
  tagRecipes,
  updateRecipe,
} from "../services/recipes.ts"
import { addRecipesToList } from "../services/list.ts"

export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024

export function recipesRoutes(
  { db }: AppContext,
  ai: AiService,
  nutrition: NutritionService,
  photos: PhotoService
) {
  const app = new Hono<AppEnv>()
  app.use(requireUser)

  const actorOf = (c: Parameters<typeof currentUser>[0]) => ({
    userId: currentUser(c).id,
    householdId: currentHousehold(c),
  })

  app.get("/", async (c) => {
    const recipes = await listRecipes(db, currentHousehold(c), {
      q: c.req.query("q"),
      tag: c.req.query("tag"),
    })
    return c.json({ recipes })
  })

  app.get("/tags", async (c) =>
    c.json({ tags: await listTags(db, currentHousehold(c)) })
  )

  /** Renames a tag everywhere, merging it into one that already exists. */
  app.patch("/tags/:name", async (c) => {
    const { name } = await readBody(c, renameTagInput)
    await renameTag(db, currentHousehold(c), c.req.param("name"), name)
    return c.json({ tags: await listTags(db, currentHousehold(c)) })
  })

  app.delete("/tags/:name", async (c) => {
    await deleteTag(db, currentHousehold(c), c.req.param("name"))
    return c.json({ tags: await listTags(db, currentHousehold(c)) })
  })

  app.post("/", async (c) => {
    const input = await readBody(c, recipeInput)
    const recipe = await createRecipe(db, currentHousehold(c), input, {
      origin: "manual",
      userId: currentUser(c).id,
    })
    nutrition.afterSave(actorOf(c), recipe)
    photos.afterCreate(actorOf(c), recipe)
    return c.json({ recipe }, 201)
  })

  /** What's in Recently deleted, for 30 days after it was deleted. */
  app.get("/deleted", async (c) =>
    c.json({ recipes: await listDeletedRecipes(db, currentHousehold(c)) })
  )

  /**
   * Something done to many recipes at once (Select on Recipes). Working out
   * nutrition, making photos and tidying up carry on in the background, one
   * recipe at a time.
   */
  app.post("/bulk", async (c) => {
    const input = await readBody(c, recipeBulkInput)
    const householdId = currentHousehold(c)
    const actor = actorOf(c)
    const inBackground = (task: (id: string) => Promise<unknown>) => {
      void (async () => {
        for (const id of input.ids) {
          await task(id).catch((error: Error) =>
            console.warn(`Bulk ${input.action} for ${id}:`, error.message)
          )
        }
      })()
      return input.ids.length
    }
    let changed = 0
    switch (input.action) {
      case "delete":
        changed = await deleteRecipes(db, householdId, input.ids)
        break
      case "restore":
        changed = await restoreRecipes(db, householdId, input.ids)
        break
      case "purge":
        changed = await purgeRecipes(db, householdId, input.ids)
        break
      case "addTags":
      case "removeTags":
        changed = await tagRecipes(
          db,
          householdId,
          input.ids,
          input.tags,
          input.action === "addTags"
        )
        break
      case "nutrition":
        changed = inBackground((id) => nutrition.workOut(actor, id))
        break
      case "photos":
        // Recipes that have a photo already are left alone.
        changed = inBackground((id) => photos.make(actor, id))
        break
      case "tidy":
        changed = inBackground((id) =>
          proposeCleanup(db, ai, householdId, id, {
            userId: actor.userId,
            sections: [...CLEANUP_SECTIONS],
          })
        )
        break
      case "toList": {
        const result = await addRecipesToList(db, householdId, input.ids)
        changed = result.added + result.merged
        break
      }
    }
    return c.json({ changed })
  })

  /** What every recipe costs at the household's stores, as far as Mise knows. */
  app.get("/costs", async (c) => {
    const costs = await recipeCosts(db, currentHousehold(c))
    return c.json({
      costs: Object.fromEntries(
        [...costs].map(([id, { lines: _, ...cost }]) => [id, cost])
      ),
    })
  })

  app.get("/:id", async (c) =>
    c.json({
      recipe: await getRecipe(db, currentHousehold(c), c.req.param("id")),
    })
  )

  /** A recipe's cost, ingredient by ingredient. */
  app.get("/:id/cost", async (c) => {
    const recipe = await getRecipe(db, currentHousehold(c), c.req.param("id"))
    const costs = await recipeCosts(db, currentHousehold(c), [recipe.id])
    return c.json({ cost: costs.get(recipe.id) ?? null })
  })

  app.put("/:id", async (c) => {
    const input = await readBody(c, recipeInput)
    const previous = await getRecipe(db, currentHousehold(c), c.req.param("id"))
    const recipe = await updateRecipe(
      db,
      currentHousehold(c),
      c.req.param("id"),
      input,
      {
        userId: currentUser(c).id,
      }
    )
    nutrition.afterSave(actorOf(c), recipe, previous)
    return c.json({ recipe })
  })

  /** What the recipe goes with: picked recipes, or every recipe with a tag. */
  app.get("/:id/pairings", async (c) =>
    c.json(await getPairings(db, currentHousehold(c), c.req.param("id")))
  )

  app.post("/:id/pairings", async (c) => {
    const input = await readBody(c, addPairingsInput)
    return c.json(
      await addPairings(db, currentHousehold(c), c.req.param("id"), input)
    )
  })

  app.delete("/:id/pairings/:pairingId", async (c) =>
    c.json(
      await removePairing(
        db,
        currentHousehold(c),
        c.req.param("id"),
        c.req.param("pairingId")
      )
    )
  )

  /** Corrections to the diet labels the ingredients suggest. */
  app.put("/:id/diets", async (c) => {
    const { overrides } = await readBody(c, setDietsInput)
    const recipe = await setRecipeFields(
      db,
      currentHousehold(c),
      c.req.param("id"),
      { dietOverrides: overrides }
    )
    return c.json({ recipe })
  })

  /** Works out nutrition now, from USDA data or an AI estimate. */
  app.post("/:id/nutrition", async (c) =>
    c.json({ recipe: await nutrition.workOut(actorOf(c), c.req.param("id")) })
  )

  /** What to use instead of an ingredient. */
  app.post("/:id/substitutes", async (c) => {
    const { ingredientId } = await readBody(c, substitutesInput)
    return c.json({
      substitutes: await findSubstitutes(
        db,
        ai,
        actorOf(c),
        c.req.param("id"),
        ingredientId
      ),
    })
  })

  /** Puts a substitute in the recipe for good; the version before can be restored. */
  app.post("/:id/swap", async (c) => {
    const input = await readBody(c, swapIngredientInput)
    const { previous, recipe, undoVersionId } = await swapIngredient(
      db,
      currentHousehold(c),
      c.req.param("id"),
      input,
      currentUser(c).id
    )
    nutrition.afterSave(actorOf(c), recipe, previous)
    return c.json({ recipe, undoVersionId })
  })

  /** "How did it go?": ratings and notes left after cooking. */
  app.get("/:id/cook-notes", async (c) =>
    c.json({
      notes: await listCookNotes(db, currentHousehold(c), c.req.param("id")),
    })
  )

  app.post("/:id/cook-notes", async (c) => {
    const input = await readBody(c, addCookNoteInput)
    return c.json(
      await addCookNote(db, ai, actorOf(c), c.req.param("id"), input),
      201
    )
  })

  app.delete("/:id/cook-notes/:noteId", async (c) => {
    await deleteCookNote(
      db,
      currentHousehold(c),
      c.req.param("id"),
      c.req.param("noteId")
    )
    return c.body(null, 204)
  })

  /** Makes a photo with AI, for a recipe without one (or with an AI one). */
  app.post("/:id/photo", async (c) =>
    c.json({ recipe: await photos.make(actorOf(c), c.req.param("id")) })
  )

  /** Whether a photo is being made for it now (a new recipe's, in the background). */
  app.get("/:id/photo", async (c) =>
    c.json({
      making: await photos.isMaking(currentHousehold(c), c.req.param("id")),
    })
  )

  app.patch("/:id", async (c) => {
    const { rating } = await readBody(c, rateInput)
    return c.json({
      recipe: await setRecipeFields(
        db,
        currentHousehold(c),
        c.req.param("id"),
        { rating }
      ),
    })
  })

  app.delete("/:id", async (c) => {
    await deleteRecipe(db, currentHousehold(c), c.req.param("id"))
    return c.body(null, 204)
  })

  /** "I made this". With today's date, that day's planned meal counts as cooked. */
  app.post("/:id/made", async (c) => {
    const body: unknown = await c.req.json().catch(() => ({}))
    const date = isoDate.safeParse((body as { date?: unknown }).date)
    const recipe = await setRecipeFields(
      db,
      currentHousehold(c),
      c.req.param("id"),
      {
        lastMadeAt: new Date(),
      }
    )
    if (date.success) {
      await markPlannedCooked(db, currentHousehold(c), recipe.id, date.data)
    }
    return c.json({ recipe })
  })

  app.post(
    "/:id/image",
    bodyLimit({
      maxSize: MAX_UPLOAD_BYTES,
      onError: (c) => c.json({ error: "That photo is over 20 MB" }, 413),
    }),
    async (c) => {
      const row = await findRecipeRow(
        db,
        currentHousehold(c),
        c.req.param("id")
      )
      const body = await c.req.parseBody()
      const file = body.image
      if (!(file instanceof File)) {
        throw new HttpError(400, "Choose a photo to upload")
      }
      const image = await saveImage(Buffer.from(await file.arrayBuffer()))
      const recipe = await setRecipeFields(db, currentHousehold(c), row.id, {
        image,
      })
      await deleteImage(row.image)
      return c.json({ recipe })
    }
  )

  app.delete("/:id/image", async (c) => {
    const row = await findRecipeRow(db, currentHousehold(c), c.req.param("id"))
    const recipe = await setRecipeFields(db, currentHousehold(c), row.id, {
      image: null,
    })
    await deleteImage(row.image)
    return c.json({ recipe })
  })

  /** Ask the AI to tidy the recipe. Returns its suggestions, or null if it's fine. */
  app.post("/:id/cleanup", async (c) => {
    const { sections } = await readBody(c, cleanupInput)
    const proposal = await proposeCleanup(
      db,
      ai,
      currentHousehold(c),
      c.req.param("id"),
      {
        userId: currentUser(c).id,
        sections,
      }
    )
    return c.json({ proposal })
  })

  app.get("/:id/proposal", async (c) =>
    c.json({
      proposal: await pendingSuggestionFor(
        db,
        currentHousehold(c),
        c.req.param("id")
      ),
    })
  )

  app.get("/:id/versions", async (c) =>
    c.json({
      versions: await listVersions(db, currentHousehold(c), c.req.param("id")),
    })
  )

  app.post("/:id/versions/:versionId/restore", async (c) => {
    const previous = await getRecipe(db, currentHousehold(c), c.req.param("id"))
    const recipe = await restoreVersion(
      db,
      currentHousehold(c),
      c.req.param("id"),
      c.req.param("versionId"),
      currentUser(c).id
    )
    nutrition.afterSave(actorOf(c), recipe, previous)
    return c.json({ recipe })
  })

  return app
}
