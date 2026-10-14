import { importTextInput, importUrlInput } from "@mise/shared"
import { Hono } from "hono"
import { bodyLimit } from "hono/body-limit"

import { requireUser } from "../auth/middleware.ts"
import type { AiService } from "../ai/service.ts"
import { currentUser, type AppContext, type AppEnv } from "../context.ts"
import { HttpError, readBody } from "../http.ts"
import { extractRecipe, photosToParts } from "../import/ai-extract.ts"
import { fetchPublic } from "../import/safe-fetch.ts"
import { importFromUrl } from "../import/url.ts"
import { createRecipe } from "../services/recipes.ts"

/** Four phone photos, with some room to spare. */
const MAX_PHOTO_UPLOAD = 60 * 1024 * 1024

export function importRoutes(
  { db, fetcher = fetchPublic }: AppContext,
  ai: AiService
) {
  const app = new Hono<AppEnv>()
  app.use(requireUser)

  app.post("/url", async (c) => {
    const { url, force } = await readBody(c, importUrlInput)
    const result = await importFromUrl(db, url, {
      userId: currentUser(c).id,
      fetcher,
      ai,
      force,
    })
    return c.json(result, result.duplicate ? 200 : 201)
  })

  app.post("/text", async (c) => {
    const { text } = await readBody(c, importTextInput)
    const userId = currentUser(c).id
    const input = await extractRecipe(ai, userId, [{ type: "text", text }])
    const recipe = await createRecipe(db, input, { origin: "text", userId })
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
      const userId = currentUser(c).id
      const input = await extractRecipe(ai, userId, parts)
      const recipe = await createRecipe(db, input, { origin: "photo", userId })
      return c.json({ recipe, duplicate: false }, 201)
    }
  )

  return app
}
