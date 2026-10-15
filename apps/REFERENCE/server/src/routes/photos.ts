import { Hono } from "hono"

import { requireAdmin, requireUser } from "../auth/middleware.ts"
import { currentHousehold, currentUser, type AppEnv } from "../context.ts"
import type { PhotoService } from "../services/photos.ts"

/** Making photos for a household's recipes that have none (household admins). */
export function photosRoutes(photos: PhotoService) {
  const app = new Hono<AppEnv>()
  app.use(requireUser)

  app.get("/library", requireAdmin, async (c) =>
    c.json(await photos.libraryStatus(currentHousehold(c)))
  )

  app.post("/library", requireAdmin, async (c) =>
    c.json(
      {
        job: await photos.startLibraryRun({
          userId: currentUser(c).id,
          householdId: currentHousehold(c),
        }),
      },
      201
    )
  )

  app.post("/library/:id/stop", requireAdmin, async (c) =>
    c.json({
      job: await photos.stopLibraryRun(currentHousehold(c), c.req.param("id")),
    })
  )

  return app
}
