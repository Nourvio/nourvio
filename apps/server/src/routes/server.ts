import { updateServerSettingsInput } from "@mise/shared"
import { Hono } from "hono"

import { requireServerAdmin, requireUser } from "../auth/middleware.ts"
import { currentHousehold, type AppContext, type AppEnv } from "../context.ts"
import { HttpError, readBody } from "../http.ts"
import {
  deleteHousehold,
  getServerSettings,
  listHouseholdSummaries,
  updateServerSettings,
} from "../services/households.ts"

/** Running the server: sign-up and the households on it. Server admin only. */
export function serverRoutes({ db }: AppContext) {
  const app = new Hono<AppEnv>()
  app.use(requireUser, requireServerAdmin)

  app.get("/settings", async (c) => c.json(await getServerSettings(db)))

  app.put("/settings", async (c) => {
    const input = await readBody(c, updateServerSettingsInput)
    return c.json(await updateServerSettings(db, input))
  })

  app.get("/households", async (c) =>
    c.json({
      households: await listHouseholdSummaries(db, currentHousehold(c)),
    })
  )

  app.delete("/households/:id", async (c) => {
    if (c.req.param("id") === currentHousehold(c)) {
      throw new HttpError(400, "You can't delete your own household")
    }
    await deleteHousehold(db, c.req.param("id"))
    return c.body(null, 204)
  })

  return app
}
