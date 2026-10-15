import { testAiKeyInput, updateAiSettingsInput } from "@mise/shared"
import { Hono } from "hono"

import {
  requireAdmin,
  requireServerAdmin,
  requireUser,
} from "../auth/middleware.ts"
import type { AiService } from "../ai/service.ts"
import {
  currentHousehold,
  currentUser,
  type AppContext,
  type AppEnv,
} from "../context.ts"
import { readBody } from "../http.ts"
import {
  cancelCleanupJob,
  countUntidied,
  latestCleanupJob,
  startCleanupJob,
} from "../services/cleanup-jobs.ts"

/**
 * Whether AI can be used (everyone), its keys, models and spending (the
 * server admin), and tidying a household's whole library (household admins).
 */
export function aiRoutes({ db }: AppContext, ai: AiService) {
  const app = new Hono<AppEnv>()
  app.use(requireUser)

  app.get("/status", async (c) => c.json(await ai.status()))

  // A household's library tidy-up, on the household's own recipes.
  app.get("/cleanup-job", requireAdmin, async (c) =>
    c.json({
      job: await latestCleanupJob(db, currentHousehold(c)),
      untidied: await countUntidied(db, currentHousehold(c)),
    })
  )

  app.post("/cleanup-job", requireAdmin, async (c) =>
    c.json(
      {
        job: await startCleanupJob(db, ai, {
          userId: currentUser(c).id,
          householdId: currentHousehold(c),
        }),
      },
      201
    )
  )

  app.post("/cleanup-job/:id/cancel", requireAdmin, async (c) =>
    c.json({
      job: await cancelCleanupJob(db, currentHousehold(c), c.req.param("id")),
    })
  )

  app.use("/settings/*", requireServerAdmin)
  app.use("/settings", requireServerAdmin)

  app.get("/settings", async (c) => c.json(await ai.getSettings()))

  app.put("/settings", async (c) => {
    const input = await readBody(c, updateAiSettingsInput)
    return c.json(await ai.updateSettings(input))
  })

  app.post("/settings/test", async (c) => {
    const { provider, key } = await readBody(c, testAiKeyInput)
    return c.json(await ai.testKey(provider, key))
  })

  app.get("/settings/models", async (c) =>
    c.json({ models: await ai.listModels() })
  )

  app.get("/settings/usage", async (c) =>
    c.json({ usage: await ai.usageSummary() })
  )

  return app
}
