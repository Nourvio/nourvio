import { testAiKeyInput, updateAiSettingsInput } from "@mise/shared"
import { Hono } from "hono"

import { requireAdmin, requireUser } from "../auth/middleware.ts"
import type { AiService } from "../ai/service.ts"
import type { AppEnv } from "../context.ts"
import { readBody } from "../http.ts"

/** Whether AI can be used (everyone), and its settings (admins). */
export function aiRoutes(ai: AiService) {
  const app = new Hono<AppEnv>()
  app.use(requireUser)

  app.get("/status", async (c) => c.json(await ai.status()))

  app.use("/settings/*", requireAdmin)
  app.use("/settings", requireAdmin)

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
