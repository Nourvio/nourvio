import { addPlanEntryInput, isoDate, updatePlanEntryInput } from "@mise/shared"
import { Hono } from "hono"

import { requireUser } from "../auth/middleware.ts"
import {
  currentHousehold,
  currentUser,
  type AppContext,
  type AppEnv,
} from "../context.ts"
import { HttpError, readBody } from "../http.ts"
import {
  addEntry,
  deleteEntry,
  listEntries,
  updateEntry,
} from "../services/plan.ts"

/** The household's meal plan. */
export function planRoutes({ db }: AppContext) {
  const app = new Hono<AppEnv>()
  app.use(requireUser)

  app.get("/", async (c) => {
    const from = isoDate.safeParse(c.req.query("from"))
    const to = isoDate.safeParse(c.req.query("to"))
    if (!from.success || !to.success) {
      throw new HttpError(
        400,
        "Give from and to dates, like ?from=2026-10-11&to=2026-10-17"
      )
    }
    return c.json({
      entries: await listEntries(db, currentHousehold(c), from.data, to.data),
    })
  })

  app.post("/entries", async (c) => {
    const input = await readBody(c, addPlanEntryInput)
    const entry = await addEntry(
      db,
      currentHousehold(c),
      input,
      currentUser(c).id
    )
    return c.json({ entry }, 201)
  })

  app.patch("/entries/:id", async (c) => {
    const input = await readBody(c, updatePlanEntryInput)
    return c.json({
      entry: await updateEntry(
        db,
        currentHousehold(c),
        c.req.param("id"),
        input
      ),
    })
  })

  app.delete("/entries/:id", async (c) => {
    await deleteEntry(db, currentHousehold(c), c.req.param("id"))
    return c.body(null, 204)
  })

  return app
}
