import { addPantryItemInput, updatePantryItemInput } from "@mise/shared"
import { Hono } from "hono"

import { requireUser } from "../auth/middleware.ts"
import { currentHousehold, type AppContext, type AppEnv } from "../context.ts"
import { readBody } from "../http.ts"
import {
  addPantryItem,
  deletePantryItem,
  listPantry,
  updatePantryItem,
} from "../services/pantry.ts"

/** What the household has at home. */
export function pantryRoutes({ db }: AppContext) {
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
