import { setupInput, type SetupStatus } from "@mise/shared"
import { Hono } from "hono"

import { RateLimiter } from "../auth/rate-limit.ts"
import { createSession, setSessionCookie } from "../auth/sessions.ts"
import type { AppContext, AppEnv } from "../context.ts"
import { clientIp, HttpError, readBody, tooManyAttempts } from "../http.ts"
import {
  createHouseholdWithAdmin,
  getServerSettings,
} from "../services/households.ts"
import { countUsers, toUser } from "../services/users.ts"

/**
 * First run: create the first household and its admin, who also runs the
 * server, using the setup code from the server log.
 */
export function setupRoutes({ db, setupCode }: AppContext) {
  const app = new Hono<AppEnv>()
  const attempts = new RateLimiter(10, 15 * 60 * 1000)

  app.get("/status", async (c) => {
    const status: SetupStatus = {
      needsSetup: (await countUsers(db)) === 0,
      signupOpen: (await getServerSettings(db)).signupOpen,
    }
    return c.json(status)
  })

  app.post("/", async (c) => {
    if ((await countUsers(db)) > 0) {
      throw new HttpError(409, "Mise is already set up. Sign in instead.")
    }
    const ip = clientIp(c)
    const wait = attempts.retryAfter(ip)
    if (wait) throw tooManyAttempts(wait)

    const input = await readBody(c, setupInput)
    if (!setupCode.matches(input.code)) {
      attempts.fail(ip)
      throw new HttpError(403, "That setup code isn't right", {
        fields: {
          code: "That code isn't right. The current one is in the server log.",
        },
      })
    }
    setupCode.clear()

    const user = await createHouseholdWithAdmin(db, {
      ...input,
      isServerAdmin: true,
    })
    const session = await createSession(db, user.id, c.req.header("user-agent"))
    setSessionCookie(c, session.token, session.expiresAt)
    return c.json({ user: toUser(user) }, 201)
  })

  return app
}
