import { Hono } from "hono"

import { requireServerAdmin, requireUser } from "../auth/middleware.ts"
import type { AppEnv } from "../context.ts"
import type { UpdateService } from "../services/updates.ts"

/** Whether a newer Mise is on GitHub (server admin): the server admin is who updates it. */
export function updateRoutes(updates: UpdateService) {
  const app = new Hono<AppEnv>()
  app.use(requireUser, requireServerAdmin)

  app.get("/", async (c) => c.json({ status: await updates.status() }))

  /** Checks GitHub now rather than waiting for the next check. */
  app.post("/check", async (c) =>
    c.json({ status: await updates.status(true) })
  )

  return app
}
