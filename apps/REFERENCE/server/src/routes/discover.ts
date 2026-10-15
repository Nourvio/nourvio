import { discoverInput } from "@mise/shared"
import { Hono } from "hono"

import type { AiService } from "../ai/service.ts"
import { requireUser } from "../auth/middleware.ts"
import {
  currentHousehold,
  currentUser,
  type AppContext,
  type AppEnv,
} from "../context.ts"
import { readBody } from "../http.ts"
import { fetchPublic } from "../import/safe-fetch.ts"
import {
  discoveredPhoto,
  getDiscovery,
  listDiscoveries,
  startDiscovery,
} from "../services/discover.ts"
import { remoteThumbnail } from "../services/remote-images.ts"

/** Recipes the assistant finds on the web for a theme. */
export function discoverRoutes(
  { db, fetcher = fetchPublic }: AppContext,
  ai: AiService
) {
  const app = new Hono<AppEnv>()
  app.use(requireUser)

  app.get("/", async (c) =>
    c.json({ discoveries: await listDiscoveries(db, currentHousehold(c)) })
  )

  app.post("/", async (c) => {
    const { theme } = await readBody(c, discoverInput)
    const discovery = await startDiscovery(
      db,
      ai,
      fetcher,
      { userId: currentUser(c).id, householdId: currentHousehold(c) },
      theme
    )
    return c.json({ discovery }, 202)
  })

  app.get("/:id", async (c) =>
    c.json({
      discovery: await getDiscovery(db, currentHousehold(c), c.req.param("id")),
    })
  )

  app.get("/:id/:index/image", async (c) => {
    const { image, page } = await discoveredPhoto(
      db,
      currentHousehold(c),
      c.req.param("id"),
      Number(c.req.param("index"))
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
