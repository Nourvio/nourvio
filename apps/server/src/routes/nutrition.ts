import { testUsdaKeyInput, updateNutritionSettingsInput } from "@mise/shared"
import { Hono } from "hono"

import { requireServerAdmin } from "../auth/middleware.ts"
import type { AppContext, AppEnv } from "../context.ts"
import { HttpError, readBody } from "../http.ts"
import {
  createFdcClient,
  FdcKeyError,
  FdcRateLimitError,
} from "../nutrition/fdc.ts"
import {
  getNutritionSettings,
  saveUsdaKey,
  usdaKey,
} from "../nutrition/settings.ts"
import type { NutritionService } from "../services/nutrition.ts"

/** The server's USDA key. Server admin only. */
export function nutritionRoutes(
  { db, fdcFactory }: AppContext,
  nutrition: NutritionService
) {
  const app = new Hono<AppEnv>()
  app.use(requireServerAdmin)
  const factory = fdcFactory ?? ((key: string) => createFdcClient(key))

  app.get("/settings", async (c) =>
    c.json({
      settings: await getNutritionSettings(db),
      abilities: await nutrition.abilities(),
    })
  )

  app.put("/settings", async (c) => {
    const { usdaKey: key } = await readBody(c, updateNutritionSettingsInput)
    await saveUsdaKey(db, key)
    return c.json({ settings: await getNutritionSettings(db) })
  })

  /** Tries a key (given, or the saved one) with a small search. */
  app.post("/settings/test", async (c) => {
    const { usdaKey: given } = await readBody(c, testUsdaKeyInput)
    const key = given ?? (await usdaKey(db))?.key
    if (!key) throw new HttpError(400, "Add a USDA key first")
    try {
      const found = await factory(key).search("apple")
      return c.json({ ok: true, found: found.length })
    } catch (error) {
      if (error instanceof FdcKeyError) {
        throw new HttpError(
          400,
          "USDA refused that key. Check it and try again."
        )
      }
      if (error instanceof FdcRateLimitError) {
        throw new HttpError(
          429,
          "That key is over its hourly limit. Try again later."
        )
      }
      throw new HttpError(502, "Couldn't reach USDA FoodData Central")
    }
  })

  return app
}
