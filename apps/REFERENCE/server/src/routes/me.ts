import { changePasswordInput, updateMeInput } from "@mise/shared"
import { Hono } from "hono"

import { requireUser } from "../auth/middleware.ts"
import { verifyPassword } from "../auth/passwords.ts"
import { deleteUserSessions } from "../auth/sessions.ts"
import { currentUser, type AppContext, type AppEnv } from "../context.ts"
import { HttpError, readBody } from "../http.ts"
import { toUser, updateUser } from "../services/users.ts"

/** The signed-in person's own account: name, appearance and password. */
export function meRoutes({ db }: AppContext) {
  const app = new Hono<AppEnv>()
  app.use(requireUser)

  app.patch("/", async (c) => {
    const input = await readBody(c, updateMeInput)
    const user = await updateUser(db, currentUser(c).id, input)
    return c.json({ user: toUser(user) })
  })

  app.post("/password", async (c) => {
    const input = await readBody(c, changePasswordInput)
    const user = currentUser(c)
    if (!(await verifyPassword(input.currentPassword, user.passwordHash))) {
      throw new HttpError(400, "Your current password isn't right", {
        fields: { currentPassword: "That isn't your current password" },
      })
    }
    await updateUser(db, user.id, { password: input.newPassword })
    // Sign out other devices, but not this one.
    await deleteUserSessions(db, user.id, c.get("sessionId"))
    return c.body(null, 204)
  })

  return app
}
