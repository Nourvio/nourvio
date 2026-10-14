import { loginInput } from "@mise/shared"
import { Hono } from "hono"

import { requireUser } from "../auth/middleware.ts"
import { verifyAgainstDummy, verifyPassword } from "../auth/passwords.ts"
import { RateLimiter } from "../auth/rate-limit.ts"
import {
  clearSessionCookie,
  createSession,
  deleteSession,
  getSessionToken,
  setSessionCookie,
} from "../auth/sessions.ts"
import { currentUser, type AppContext, type AppEnv } from "../context.ts"
import { clientIp, HttpError, readBody, tooManyAttempts } from "../http.ts"
import { findUserByUsername, toUser } from "../services/users.ts"

const FIFTEEN_MINUTES = 15 * 60 * 1000

export function authRoutes({ db }: AppContext) {
  const app = new Hono<AppEnv>()
  // Per username stops guessing one account's password; per IP slows down
  // trying many accounts from one place.
  const byUsername = new RateLimiter(5, FIFTEEN_MINUTES)
  const byIp = new RateLimiter(20, FIFTEEN_MINUTES)

  app.post("/login", async (c) => {
    const input = await readBody(c, loginInput)
    const ip = clientIp(c)
    const wait = Math.max(
      byUsername.retryAfter(input.username),
      byIp.retryAfter(ip)
    )
    if (wait) throw tooManyAttempts(wait)

    const user = await findUserByUsername(db, input.username)
    const valid = user
      ? await verifyPassword(input.password, user.passwordHash)
      : (await verifyAgainstDummy(input.password), false)
    if (!user || !valid) {
      byUsername.fail(input.username)
      byIp.fail(ip)
      throw new HttpError(401, "That username and password don't match")
    }
    byUsername.reset(input.username)

    const session = await createSession(db, user.id, c.req.header("user-agent"))
    setSessionCookie(c, session.token, session.expiresAt)
    return c.json({ user: toUser(user) })
  })

  app.post("/logout", async (c) => {
    const token = getSessionToken(c)
    if (token) await deleteSession(db, token)
    clearSessionCookie(c)
    return c.body(null, 204)
  })

  app.get("/me", requireUser, (c) => c.json({ user: toUser(currentUser(c)) }))

  return app
}
