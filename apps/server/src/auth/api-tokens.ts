import { createHash, randomBytes } from "node:crypto"

import { API_TOKEN_PREFIX, type ExtensionToken } from "@mise/shared"
import { and, desc, eq } from "drizzle-orm"
import { z } from "zod"

import type { Db } from "../db/client.ts"
import { apiTokens, users } from "../db/schema.ts"
import { HttpError } from "../http.ts"

/** Note when a token was used at most this often, to avoid a write on every request. */
const TOUCH_AFTER_MS = 10 * 60_000

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex")
}

function toToken(row: typeof apiTokens.$inferSelect): ExtensionToken {
  return {
    id: row.id,
    name: row.name,
    createdAt: row.createdAt.toISOString(),
    lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
  }
}

/** A new token for a person. The token itself is only ever returned here. */
export async function createApiToken(db: Db, userId: string, name: string) {
  const token = `${API_TOKEN_PREFIX}${randomBytes(32).toString("base64url")}`
  const [row] = await db
    .insert(apiTokens)
    .values({ userId, name, tokenHash: hashToken(token) })
    .returning()
  return { token, info: toToken(row!) }
}

/** The user for a token, or null if it's unknown or revoked. */
export async function validateApiToken(db: Db, token: string) {
  if (!token.startsWith(API_TOKEN_PREFIX)) return null
  const [row] = await db
    .select({ token: apiTokens, user: users })
    .from(apiTokens)
    .innerJoin(users, eq(apiTokens.userId, users.id))
    .where(eq(apiTokens.tokenHash, hashToken(token)))
    .limit(1)
  if (!row) return null
  const used = row.token.lastUsedAt?.getTime() ?? 0
  if (Date.now() - used > TOUCH_AFTER_MS) {
    await db
      .update(apiTokens)
      .set({ lastUsedAt: new Date() })
      .where(eq(apiTokens.id, row.token.id))
  }
  return row.user
}

export async function listApiTokens(db: Db, userId: string) {
  const rows = await db
    .select()
    .from(apiTokens)
    .where(eq(apiTokens.userId, userId))
    .orderBy(desc(apiTokens.createdAt))
  return rows.map(toToken)
}

export async function revokeApiToken(db: Db, userId: string, id: string) {
  const removed = z.uuid().safeParse(id).success
    ? await db
        .delete(apiTokens)
        .where(and(eq(apiTokens.id, id), eq(apiTokens.userId, userId)))
        .returning({ id: apiTokens.id })
    : []
  if (!removed.length) throw new HttpError(404, "That browser isn't connected")
}
