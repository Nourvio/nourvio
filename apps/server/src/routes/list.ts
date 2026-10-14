import {
  addFromPlanInput,
  addListItemInput,
  onHandInput,
  updateListItemInput,
  weeklyItemInput,
} from "@mise/shared"
import { Hono } from "hono"

import { requireUser } from "../auth/middleware.ts"
import { currentHousehold, type AppContext, type AppEnv } from "../context.ts"
import { readBody } from "../http.ts"
import { updateHousehold } from "../services/households.ts"
import {
  addFromPlan,
  addManualItem,
  addWeeklyItem,
  addWeeklyItems,
  clearChecked,
  deleteItem,
  deleteWeeklyItem,
  listItems,
  listWeeklyItems,
  updateItem,
  updateWeeklyItem,
} from "../services/list.ts"

/** The household's shopping list, and the items it gets every week. */
export function listRoutes({ db }: AppContext) {
  const app = new Hono<AppEnv>()
  app.use(requireUser)

  app.get("/", async (c) =>
    c.json({ items: await listItems(db, currentHousehold(c)) })
  )

  app.post("/items", async (c) => {
    const { text } = await readBody(c, addListItemInput)
    return c.json(
      { item: await addManualItem(db, currentHousehold(c), text) },
      201
    )
  })

  app.patch("/items/:id", async (c) => {
    const input = await readBody(c, updateListItemInput)
    return c.json({
      item: await updateItem(db, currentHousehold(c), c.req.param("id"), input),
    })
  })

  app.delete("/items/:id", async (c) => {
    await deleteItem(db, currentHousehold(c), c.req.param("id"))
    return c.body(null, 204)
  })

  app.post("/clear-checked", async (c) =>
    c.json({ removed: await clearChecked(db, currentHousehold(c)) })
  )

  app.post("/from-plan", async (c) => {
    const { from, to } = await readBody(c, addFromPlanInput)
    return c.json(await addFromPlan(db, currentHousehold(c), from, to))
  })

  /** What's always at home. Anyone in the household can change it. */
  app.put("/on-hand", async (c) => {
    const { items } = await readBody(c, onHandInput)
    const household = await updateHousehold(db, currentHousehold(c), {
      onHand: items,
    })
    return c.json({ items: household.onHand })
  })

  app.post("/weekly/add-to-list", async (c) =>
    c.json({ added: await addWeeklyItems(db, currentHousehold(c)) })
  )

  app.get("/weekly", async (c) =>
    c.json({ items: await listWeeklyItems(db, currentHousehold(c)) })
  )

  app.post("/weekly", async (c) => {
    const input = await readBody(c, weeklyItemInput)
    return c.json(
      { item: await addWeeklyItem(db, currentHousehold(c), input) },
      201
    )
  })

  app.patch("/weekly/:id", async (c) => {
    const input = await readBody(c, weeklyItemInput.partial())
    return c.json({
      item: await updateWeeklyItem(
        db,
        currentHousehold(c),
        c.req.param("id"),
        input
      ),
    })
  })

  app.delete("/weekly/:id", async (c) => {
    await deleteWeeklyItem(db, currentHousehold(c), c.req.param("id"))
    return c.body(null, 204)
  })

  return app
}
