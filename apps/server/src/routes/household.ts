import { createInviteInput, updateHouseholdInput } from "@mise/shared"
import { Hono } from "hono"

import { requireAdmin, requireUser } from "../auth/middleware.ts"
import {
  currentHousehold,
  currentUser,
  type AppContext,
  type AppEnv,
} from "../context.ts"
import { readBody } from "../http.ts"
import {
  createInvite,
  getHousehold,
  listInvites,
  revokeInvite,
  updateHousehold,
} from "../services/households.ts"

/** The signed-in person's household: its name and settings, and invite links. */
export function householdRoutes({ db }: AppContext) {
  const app = new Hono<AppEnv>()
  app.use(requireUser)

  app.get("/", async (c) =>
    c.json({ household: await getHousehold(db, currentHousehold(c)) })
  )

  app.patch("/", requireAdmin, async (c) => {
    const input = await readBody(c, updateHouseholdInput)
    return c.json({
      household: await updateHousehold(db, currentHousehold(c), input),
    })
  })

  app.get("/invites", requireAdmin, async (c) =>
    c.json({ invites: await listInvites(db, currentHousehold(c)) })
  )

  app.post("/invites", requireAdmin, async (c) => {
    const { role } = await readBody(c, createInviteInput)
    const invite = await createInvite(
      db,
      currentHousehold(c),
      role,
      currentUser(c).id
    )
    return c.json({ invite }, 201)
  })

  app.delete("/invites/:id", requireAdmin, async (c) => {
    await revokeInvite(db, currentHousehold(c), c.req.param("id"))
    return c.body(null, 204)
  })

  return app
}
