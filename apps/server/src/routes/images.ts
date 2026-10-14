import { readFile } from "node:fs/promises"
import { join } from "node:path"

import { Hono } from "hono"

import { requireUser } from "../auth/middleware.ts"
import type { AppEnv } from "../context.ts"
import { IMAGE_NAME, imagesDir } from "../services/images.ts"

/** Recipe photos. Signed-in users only; names are random and never reused, so cache forever. */
export function imagesRoutes() {
  const app = new Hono<AppEnv>()
  app.use(requireUser)

  app.get("/:file", async (c) => {
    const file = c.req.param("file")
    if (!IMAGE_NAME.test(file)) return c.json({ error: "Not found" }, 404)
    try {
      const data = await readFile(join(imagesDir(), file))
      return c.body(data, 200, {
        "Content-Type": "image/webp",
        "Cache-Control": "private, max-age=31536000, immutable",
      })
    } catch {
      return c.json({ error: "Not found" }, 404)
    }
  })

  return app
}
