import { importUrlInput } from "@mise/shared"
import { Hono } from "hono"

import { requireUser } from "../auth/middleware.ts"
import { currentUser, type AppContext, type AppEnv } from "../context.ts"
import { readBody } from "../http.ts"
import { fetchPublic } from "../import/safe-fetch.ts"
import { importFromUrl } from "../import/url.ts"

export function importRoutes({ db, fetcher = fetchPublic }: AppContext) {
  const app = new Hono<AppEnv>()
  app.use(requireUser)

  app.post("/url", async (c) => {
    const { url, force } = await readBody(c, importUrlInput)
    const result = await importFromUrl(db, url, {
      userId: currentUser(c).id,
      fetcher,
      force,
    })
    return c.json(result, result.duplicate ? 200 : 201)
  })

  return app
}
