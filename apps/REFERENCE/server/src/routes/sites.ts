import { followSiteInput } from "@mise/shared"
import { Hono } from "hono"

import { requireUser } from "../auth/middleware.ts"
import { currentHousehold, type AppContext, type AppEnv } from "../context.ts"
import { readBody } from "../http.ts"
import { fetchPublic } from "../import/safe-fetch.ts"
import { remoteThumbnail } from "../services/remote-images.ts"
import {
  followSite,
  listSites,
  sitePhoto,
  unfollowSite,
} from "../services/sites.ts"

/** Recipe sites the household follows, and their newest recipes. */
export function sitesRoutes({ db, fetcher = fetchPublic }: AppContext) {
  const app = new Hono<AppEnv>()
  app.use(requireUser)

  app.get("/", async (c) =>
    c.json({ sites: await listSites(db, fetcher, currentHousehold(c)) })
  )

  app.post("/", async (c) => {
    const { url } = await readBody(c, followSiteInput)
    const site = await followSite(db, fetcher, currentHousehold(c), url)
    return c.json({ site }, 201)
  })

  app.delete("/:id", async (c) => {
    await unfollowSite(db, currentHousehold(c), c.req.param("id"))
    return c.body(null, 204)
  })

  app.get("/:id/image/:key", async (c) => {
    const { image, page } = await sitePhoto(
      db,
      currentHousehold(c),
      c.req.param("id"),
      c.req.param("key")
    )
    try {
      const thumbnail = await remoteThumbnail(fetcher, image, page)
      return c.body(new Uint8Array(thumbnail), 200, {
        "content-type": "image/webp",
        "cache-control": "private, max-age=604800",
      })
    } catch {
      return c.json({ error: "That photo couldn't be fetched" }, 404)
    }
  })

  return app
}
