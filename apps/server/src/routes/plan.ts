import {
  addPlanEntriesInput,
  addPlanEntryInput,
  isoDate,
  suggestMealsInput,
  updatePlanEntryInput,
} from "@mise/shared"
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
import { suggestMeals } from "../services/suggest.ts"

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

  /** Several at once, such as an accepted week of suggestions. */
  app.post("/entries/batch", async (c) => {
    const { entries } = await readBody(c, addPlanEntriesInput)
    const added = []
    for (const entry of entries) {
      if (Boolean(entry.recipeId) === Boolean(entry.note)) continue
      added.push(
        await addEntry(db, currentHousehold(c), entry, currentUser(c).id)
      )
    }
    return c.json({ entries: added }, 201)
  })

  /** Recipe ideas for empty meals; nothing is added until they're accepted. */
  app.post("/suggest", async (c) => {
    const { slots, exclude } = await readBody(c, suggestMealsInput)
    return c.json({
      suggestions: await suggestMeals(db, currentHousehold(c), slots, {
        exclude,
      }),
    })
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
