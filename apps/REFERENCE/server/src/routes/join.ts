import { joinInput, signupInput } from "@mise/shared"
import { Hono } from "hono"

import { RateLimiter } from "../auth/rate-limit.ts"
import { createSession, setSessionCookie } from "../auth/sessions.ts"
import type { AppContext, AppEnv } from "../context.ts"
import { clientIp, HttpError, readBody, tooManyAttempts } from "../http.ts"
import {
  acceptInvite,
  createHouseholdWithAdmin,
  getServerSettings,
  previewInvite,
} from "../services/households.ts"
import { toUser, type UserRow } from "../services/users.ts"

const HOUR = 60 * 60 * 1000

async function signIn(
  db: AppContext["db"],
  c: Parameters<typeof setSessionCookie>[0],
  user: UserRow
) {
  const session = await createSession(db, user.id, c.req.header("user-agent"))
  setSessionCookie(c, session.token, session.expiresAt)
}

/** Joining a household from an invite link. No sign-in needed, of course. */
export function joinRoutes({ db }: AppContext) {
  const app = new Hono<AppEnv>()
  // Guessing tokens is hopeless (192 bits), but there's no reason to allow it.
  const attempts = new RateLimiter(20, HOUR)

  function limit(ip: string) {
    const wait = attempts.retryAfter(ip)
    if (wait) throw tooManyAttempts(wait)
  }

  app.get("/:token", async (c) => {
    const ip = clientIp(c)
    limit(ip)
    try {
      return c.json({ invite: await previewInvite(db, c.req.param("token")) })
    } catch (error) {
      attempts.fail(ip)
      throw error
    }
  })

  app.post("/:token", async (c) => {
    const ip = clientIp(c)
    limit(ip)
    const input = await readBody(c, joinInput)
    let user: UserRow
    try {
      user = await acceptInvite(db, c.req.param("token"), input)
    } catch (error) {
      attempts.fail(ip)
      throw error
    }
    await signIn(db, c, user)
    return c.json({ user: toUser(user) }, 201)
  })

  return app
}

/** Open sign-up: a new account with its own household, when the server allows it. */
export function signupRoutes({ db }: AppContext) {
  const app = new Hono<AppEnv>()
  const signups = new RateLimiter(5, HOUR)

  app.post("/", async (c) => {
    if (!(await getServerSettings(db)).signupOpen) {
      throw new HttpError(
        403,
        "Sign-up is turned off here. Ask someone with an account for an invite link."
      )
    }
    const ip = clientIp(c)
    const wait = signups.retryAfter(ip)
    if (wait) throw tooManyAttempts(wait)

    const input = await readBody(c, signupInput)
    const user = await createHouseholdWithAdmin(db, input)
    // Every sign-up counts toward the limit, not just failures.
    signups.fail(ip)
    await signIn(db, c, user)
    return c.json({ user: toUser(user) }, 201)
  })

  return app
}
