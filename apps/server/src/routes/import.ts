import {
  importBatchInput,
  mealieConnectionInput,
  importPageInput,
  importTextInput,
  importUrlInput,
  previewLinksInput,
} from "@mise/shared"
import { Hono } from "hono"
import { bodyLimit } from "hono/body-limit"

import { requireServerAdmin, requireUser } from "../auth/middleware.ts"
import type { AiService } from "../ai/service.ts"
import type { NutritionService } from "../services/nutrition.ts"
import type { PhotoService } from "../services/photos.ts"
import {
  currentHousehold,
  currentUser,
  type AppContext,
  type AppEnv,
} from "../context.ts"
import { HttpError, readBody } from "../http.ts"
import { extractRecipe, photosToParts } from "../import/ai-extract.ts"
import {
  checkMealie,
  latestMealieJob,
  startMealieImport,
} from "../import/mealie.ts"
import { fetchPublic } from "../import/safe-fetch.ts"
import { importFromPage, importFromUrl } from "../import/url.ts"
import { systemVideoTools } from "../import/video-tools.ts"
import type { ImportBatchService } from "../services/import-batches.ts"
import { importFollowUp } from "../services/import-follow-up.ts"
import { createRecipe } from "../services/recipes.ts"

/** Four phone photos, with some room to spare. */
const MAX_PHOTO_UPLOAD = 60 * 1024 * 1024

export function importRoutes(
  {
    db,
    fetcher = fetchPublic,
    videoTools = systemVideoTools,
    mealieFetch = fetch,
  }: AppContext,
  ai: AiService,
  nutrition: NutritionService,
  photos: PhotoService,
  batches: ImportBatchService
) {
  const app = new Hono<AppEnv>()
  app.use(requireUser)

  const afterImport = importFollowUp(db, ai, nutrition, photos)

  const actorOf = (c: Parameters<typeof currentUser>[0]) => ({
    userId: currentUser(c).id,
    householdId: currentHousehold(c),
  })

  app.post("/url", async (c) => {
    const { url, force } = await readBody(c, importUrlInput)
    const actor = actorOf(c)
    const result = await importFromUrl(db, url, {
      ...actor,
      fetcher,
      ai,
      videoTools,
      force,
    })
    await afterImport(result, actor)
    return c.json(result, result.duplicate ? 200 : 201)
  })

  // Several links at once: which are new, then a batch in the background.
  app.post("/links", async (c) => {
    const { text } = await readBody(c, previewLinksInput)
    return c.json(await batches.preview(currentHousehold(c), text))
  })

  app.post("/batch", async (c) => {
    const input = await readBody(c, importBatchInput)
    return c.json({ batch: await batches.start(actorOf(c), input) }, 201)
  })

  app.get("/batch/current", async (c) =>
    c.json({ batch: await batches.current(currentHousehold(c)) })
  )

  app.get("/batch/:id", async (c) =>
    c.json({ batch: await batches.get(currentHousehold(c), c.req.param("id")) })
  )

  app.post("/batch/:id/stop", async (c) =>
    c.json({
      batch: await batches.stop(currentHousehold(c), c.req.param("id")),
    })
  )

  app.post("/batch/:id/retry", async (c) =>
    c.json({
      batch: await batches.retry(currentHousehold(c), c.req.param("id")),
    })
  )

  app.post("/batch/:id/items/:itemId/retry", async (c) =>
    c.json({
      batch: await batches.retry(
        currentHousehold(c),
        c.req.param("id"),
        c.req.param("itemId")
      ),
    })
  )

  // From the browser extension: a page as the person's browser shows it.
  app.post("/page", async (c) => {
    const page = await readBody(c, importPageInput)
    const actor = actorOf(c)
    const result = await importFromPage(db, page, { ...actor, fetcher, ai })
    await afterImport(result, actor)
    return c.json(result, result.duplicate ? 200 : 201)
  })

  app.post("/text", async (c) => {
    const { text } = await readBody(c, importTextInput)
    const actor = actorOf(c)
    const input = await extractRecipe(ai, actor, [{ type: "text", text }])
    const recipe = await createRecipe(db, actor.householdId, input, {
      origin: "text",
      userId: actor.userId,
    })
    await afterImport({ recipe, duplicate: false }, actor)
    return c.json({ recipe, duplicate: false }, 201)
  })

  app.post(
    "/photo",
    bodyLimit({
      maxSize: MAX_PHOTO_UPLOAD,
      onError: (c) => c.json({ error: "Those photos are too large" }, 413),
    }),
    async (c) => {
      const body = await c.req.parseBody({ all: true })
      const files = [body.photos ?? []]
        .flat()
        .filter((file): file is File => file instanceof File)
      if (!files.length) throw new HttpError(400, "Add a photo of the recipe")
      const parts = await photosToParts(
        await Promise.all(
          files.map(async (file) => Buffer.from(await file.arrayBuffer()))
        )
      )
      const actor = actorOf(c)
      const input = await extractRecipe(ai, actor, parts)
      const recipe = await createRecipe(db, actor.householdId, input, {
        origin: "photo",
        userId: actor.userId,
      })
      await afterImport({ recipe, duplicate: false }, actor)
      return c.json({ recipe, duplicate: false }, 201)
    }
  )

  // Moving from Mealie, into the server admin's household. Server admin only,
  // because it can reach the home network.
  app.use("/mealie/*", requireServerAdmin)
  app.use("/mealie", requireServerAdmin)

  app.post("/mealie/check", async (c) => {
    const { url, token } = await readBody(c, mealieConnectionInput)
    return c.json(
      await checkMealie(db, currentHousehold(c), url, token, mealieFetch)
    )
  })

  app.post("/mealie", async (c) => {
    const { url, token } = await readBody(c, mealieConnectionInput)
    const job = await startMealieImport(db, url, token, {
      ...actorOf(c),
      fetcher: mealieFetch,
    })
    return c.json({ job }, 201)
  })

  app.get("/mealie/job", async (c) =>
    c.json({ job: await latestMealieJob(db, currentHousehold(c)) })
  )

  return app
}
