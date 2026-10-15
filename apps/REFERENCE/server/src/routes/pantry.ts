import {
  addPantryItemInput,
  pantryBulkInput,
  updatePantryItemInput,
} from "@mise/shared"
import { Hono } from "hono"

import { requireUser } from "../auth/middleware.ts"
import {
  currentHousehold,
  currentUser,
  type AppContext,
  type AppEnv,
} from "../context.ts"
import { readBody } from "../http.ts"
import type { EventBus } from "../services/events.ts"
import { addNamesToList } from "../services/list.ts"
import {
  addPantryItem,
  bulkPantryItems,
  deletePantryItem,
  listPantry,
  pantryRows,
  updatePantryItem,
} from "../services/pantry.ts"

/** What the household has at home. */
export function pantryRoutes({ db }: AppContext, events: EventBus) {
  const app = new Hono<AppEnv>()
  app.use(requireUser)

  app.get("/", async (c) =>
    c.json({ items: await listPantry(db, currentHousehold(c)) })
  )

  app.post("/", async (c) => {
    const { text } = await readBody(c, addPantryItemInput)
    return c.json(
      { item: await addPantryItem(db, currentHousehold(c), text) },
      201
    )
  })

  /** Selected items, all at once. */
  app.post("/bulk", async (c) => {
    const input = await readBody(c, pantryBulkInput)
    const householdId = currentHousehold(c)
    if (input.action !== "toList") {
      return c.json({ changed: await bulkPantryItems(db, householdId, input) })
    }
    const rows = await pantryRows(db, householdId, input.ids)
    const changed = await addNamesToList(
      db,
      householdId,
      rows.map((row) => row.name)
    )
    // The list changed: show it on phones that have it open.
    if (changed) {
      events.publish(householdId, { type: "list", by: currentUser(c).id })
    }
    return c.json({ changed })
  })

  app.patch("/:id", async (c) => {
    const input = await readBody(c, updatePantryItemInput)
    return c.json({
      item: await updatePantryItem(
        db,
        currentHousehold(c),
        c.req.param("id"),
        input
      ),
    })
  })

  app.delete("/:id", async (c) => {
    await deletePantryItem(db, currentHousehold(c), c.req.param("id"))
    return c.body(null, 204)
  })

  return app
}
