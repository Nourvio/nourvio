import { createUserInput, updateUserInput } from "@mise/shared"
import { Hono } from "hono"
import { z } from "zod"

import { requireAdmin, requireUser } from "../auth/middleware.ts"
import { deleteUserSessions } from "../auth/sessions.ts"
import { currentUser, type AppContext, type AppEnv } from "../context.ts"
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

/** Household members. Admins only. */
export function usersRoutes({ db }: AppContext) {
  const app = new Hono<AppEnv>()
  app.use(requireUser, requireAdmin)

  async function findTarget(id: string) {
    const user = idSchema.safeParse(id).success
      ? await findUserById(db, id)
      : undefined
    if (!user) throw new HttpError(404, "That person isn't in this household")
    return user
  }

  async function assertNotLastAdmin(role: string) {
    if (role === "admin" && (await countAdmins(db)) <= 1) {
      throw new HttpError(400, "Mise needs at least one admin")
    }
  }

  app.get("/", async (c) => {
    const users = await listUsers(db)
    return c.json({ users: users.map(toUser) })
  })

  app.post("/", async (c) => {
    const input = await readBody(c, createUserInput)
    const user = await createUser(db, input)
    return c.json({ user: toUser(user) }, 201)
  })

  app.patch("/:id", async (c) => {
    const target = await findTarget(c.req.param("id"))
    const input = await readBody(c, updateUserInput)
    if (input.role === "member") await assertNotLastAdmin(target.role)

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
    const target = await findTarget(c.req.param("id"))
    if (target.id === currentUser(c).id) {
      throw new HttpError(400, "You can't remove yourself")
    }
    await assertNotLastAdmin(target.role)
    await deleteUser(db, target.id)
    return c.body(null, 204)
  })

  return app
}
