import { createUserInput, updateUserInput } from "@mise/shared"
import { Hono } from "hono"
import { z } from "zod"

import { requireAdmin, requireUser } from "../auth/middleware.ts"
import { deleteUserSessions } from "../auth/sessions.ts"
import {
  currentHousehold,
  currentUser,
  type AppContext,
  type AppEnv,
} from "../context.ts"
import { HttpError, readBody } from "../http.ts"
import {
  countAdmins,
  createUser,
  deleteUser,
  findUserById,
  listUsers,
  toUser,
  updateUser,
} from "../services/users.ts"

const idSchema = z.uuid()

/** The members of the admin's own household. Household admins only. */
export function usersRoutes({ db }: AppContext) {
  const app = new Hono<AppEnv>()
  app.use(requireUser, requireAdmin)

  /** Someone in the same household; anyone else is a 404. */
  async function findTarget(householdId: string, id: string) {
    const user = idSchema.safeParse(id).success
      ? await findUserById(db, id)
      : undefined
    if (!user || user.householdId !== householdId) {
      throw new HttpError(404, "That person isn't in this household")
    }
    return user
  }

  async function assertNotLastAdmin(householdId: string, role: string) {
    if (role === "admin" && (await countAdmins(db, householdId)) <= 1) {
      throw new HttpError(400, "A household needs at least one admin")
    }
  }

  app.get("/", async (c) => {
    const users = await listUsers(db, currentHousehold(c))
    return c.json({ users: users.map(toUser) })
  })

  app.post("/", async (c) => {
    const input = await readBody(c, createUserInput)
    const user = await createUser(db, {
      ...input,
      householdId: currentHousehold(c),
    })
    return c.json({ user: toUser(user) }, 201)
  })

  app.patch("/:id", async (c) => {
    const target = await findTarget(currentHousehold(c), c.req.param("id"))
    const input = await readBody(c, updateUserInput)
    if (input.role === "member") {
      await assertNotLastAdmin(target.householdId, target.role)
    }

    const user = await updateUser(db, target.id, input)
    if (input.password) {
      // A reset password signs them out everywhere (except this device, if it's you).
      const keep =
        target.id === currentUser(c).id ? c.get("sessionId") : undefined
      await deleteUserSessions(db, target.id, keep)
    }
    return c.json({ user: toUser(user) })
  })

  app.delete("/:id", async (c) => {
    const target = await findTarget(currentHousehold(c), c.req.param("id"))
    if (target.id === currentUser(c).id) {
      throw new HttpError(400, "You can't remove yourself")
    }
    await assertNotLastAdmin(target.householdId, target.role)
    await deleteUser(db, target.id)
    return c.body(null, 204)
  })

  return app
}
