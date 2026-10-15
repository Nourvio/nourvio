import type { MiddlewareHandler } from "hono"

import type { AppEnv } from "../context.ts"
import type { Db } from "../db/client.ts"
import { HttpError } from "../http.ts"
import { validateApiToken } from "./api-tokens.ts"
import {
  clearSessionCookie,
  getSessionToken,
  setSessionCookie,
  validateSession,
} from "./sessions.ts"

/**
 * Looks up who's asking and sets `user` for later handlers: the browser
 * extension's API token (an Authorization header), else the session cookie.
 */
export function loadSession(db: Db): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const bearer = c.req
      .header("authorization")
      ?.match(/^Bearer\s+(\S+)$/i)?.[1]
    if (bearer) {
      const user = await validateApiToken(db, bearer)
      if (!user)
        throw new HttpError(
          401,
          "That extension token isn't valid any more. Connect the extension again."
        )
      c.set("user", user)
      c.set("viaToken", true)
      return next()
    }
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

/** An admin of their household: manages its members, invites and settings. */
export const requireAdmin: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (c.get("user")?.role !== "admin") {
    throw new HttpError(403, "Only a household admin can do that")
  }
  await next()
}

/** The person who runs the server: AI keys, sign-up, households, Mealie. */
export const requireServerAdmin: MiddlewareHandler<AppEnv> = async (
  c,
  next
) => {
  if (!c.get("user")?.isServerAdmin) {
    throw new HttpError(403, "Only the server admin can do that")
  }
  await next()
}
