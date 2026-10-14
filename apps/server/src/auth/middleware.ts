import type { MiddlewareHandler } from "hono"

import type { AppEnv } from "../context.ts"
import type { Db } from "../db/client.ts"
import { HttpError } from "../http.ts"
import {
  clearSessionCookie,
  getSessionToken,
  setSessionCookie,
  validateSession,
} from "./sessions.ts"

/** Looks up the session cookie, if there is one, and sets `user` for later handlers. */
export function loadSession(db: Db): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const token = getSessionToken(c)
    if (token) {
      const session = await validateSession(db, token)
      if (session) {
        c.set("user", session.user)
        c.set("sessionId", session.sessionId)
        if (session.refreshedUntil) {
          setSessionCookie(c, token, session.refreshedUntil)
        }
      } else {
        clearSessionCookie(c)
      }
    }
    await next()
  }
}

export const requireUser: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (!c.get("user")) throw new HttpError(401, "Sign in to continue")
  await next()
}

export const requireAdmin: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (c.get("user")?.role !== "admin") {
    throw new HttpError(403, "Only an admin can do that")
  }
  await next()
}
