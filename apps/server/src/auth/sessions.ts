import { createHash, randomBytes } from "node:crypto"

import { and, eq, ne } from "drizzle-orm"
import type { Context } from "hono"
import { deleteCookie, getCookie, setCookie } from "hono/cookie"

import type { Db } from "../db/client.ts"
import { sessions, users } from "../db/schema.ts"

export const SESSION_COOKIE = "mise_session"

/** Sessions last 90 days from their last use, so the kitchen iPad stays signed in. */
const SESSION_LIFETIME_MS = 90 * 24 * 60 * 60 * 1000
/** Extend a session at most once a day, to avoid a write on every request. */
const REFRESH_AFTER_MS = 24 * 60 * 60 * 1000

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex")
}

export async function createSession(
  db: Db,
  userId: string,
  userAgent?: string
) {
  const token = randomBytes(32).toString("base64url")
  const expiresAt = new Date(Date.now() + SESSION_LIFETIME_MS)
  await db.insert(sessions).values({
    id: hashToken(token),
    userId,
    userAgent: userAgent?.slice(0, 300),
    expiresAt,
  })
  return { token, expiresAt }
}

/** The user for a session token, or null if it's unknown or expired. */
export async function validateSession(db: Db, token: string) {
  const id = hashToken(token)
  const [row] = await db
    .select({ session: sessions, user: users })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(eq(sessions.id, id))
    .limit(1)
  if (!row) return null

  const now = Date.now()
  if (row.session.expiresAt.getTime() <= now) {
    await db.delete(sessions).where(eq(sessions.id, id))
    return null
  }

  let refreshedUntil: Date | null = null
  if (now - row.session.lastSeenAt.getTime() > REFRESH_AFTER_MS) {
    refreshedUntil = new Date(now + SESSION_LIFETIME_MS)
    await db
      .update(sessions)
      .set({ lastSeenAt: new Date(now), expiresAt: refreshedUntil })
      .where(eq(sessions.id, id))
  }
  return { user: row.user, sessionId: id, refreshedUntil }
}

export async function deleteSession(db: Db, token: string) {
  await db.delete(sessions).where(eq(sessions.id, hashToken(token)))
}

/** Signs a user out everywhere, optionally keeping the session they're using. */
export async function deleteUserSessions(
  db: Db,
  userId: string,
  keepSessionId?: string
) {
  await db
    .delete(sessions)
    .where(
      and(
        eq(sessions.userId, userId),
        keepSessionId ? ne(sessions.id, keepSessionId) : undefined
      )
    )
}

function isHttps(c: Context) {
  const forwarded = c.req.header("x-forwarded-proto")?.split(",")[0]?.trim()
  return forwarded === "https" || new URL(c.req.url).protocol === "https:"
}

export function setSessionCookie(c: Context, token: string, expiresAt: Date) {
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "Lax",
    path: "/",
    // On plain http (the home network) a Secure cookie would never be sent back.
    secure: isHttps(c),
    expires: expiresAt,
  })
}

export function getSessionToken(c: Context) {
  return getCookie(c, SESSION_COOKIE)
}

export function clearSessionCookie(c: Context) {
  deleteCookie(c, SESSION_COOKIE, { path: "/" })
}
