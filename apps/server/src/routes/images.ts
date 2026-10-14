import { readFile } from "node:fs/promises"
import { join } from "node:path"

import { and, eq } from "drizzle-orm"
import { Hono } from "hono"

import { requireUser } from "../auth/middleware.ts"
import { currentHousehold, type AppContext, type AppEnv } from "../context.ts"
import { recipes } from "../db/schema.ts"
import { IMAGE_NAME, imagesDir } from "../services/images.ts"

/**
 * Recipe photos, for the household whose recipe it is. Names are random and
 * never reused, so they cache forever.
 */
export function imagesRoutes({ db }: AppContext) {
  const app = new Hono<AppEnv>()
  app.use(requireUser)

  app.get("/:file", async (c) => {
    const file = c.req.param("file")
    if (!IMAGE_NAME.test(file)) return c.json({ error: "Not found" }, 404)
    const [owner] = await db
      .select({ id: recipes.id })
      .from(recipes)
      .where(
        and(
          eq(recipes.householdId, currentHousehold(c)),
          eq(recipes.image, file.replace(/(-thumb)?\.webp$/, ""))
        )
      )
      .limit(1)
    if (!owner) return c.json({ error: "Not found" }, 404)
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
