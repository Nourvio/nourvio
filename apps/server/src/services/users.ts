import type { Appearance, Role, User } from "@mise/shared"
import { and, asc, count, eq } from "drizzle-orm"

import { hashPassword } from "../auth/passwords.ts"
import type { Db } from "../db/client.ts"
import { users } from "../db/schema.ts"
import { HttpError } from "../http.ts"

export type UserRow = typeof users.$inferSelect

export function toUser(row: UserRow): User {
  return {
    id: row.id,
    username: row.username,
    displayName: row.displayName,
    householdId: row.householdId,
    role: row.role,
    isServerAdmin: row.isServerAdmin,
    appearance: row.appearance,
    createdAt: row.createdAt.toISOString(),
  }
}

export async function countUsers(db: Db) {
  const [row] = await db.select({ total: count() }).from(users)
  return row?.total ?? 0
}

/** Admins in a household. Every household keeps at least one. */
export async function countAdmins(db: Db, householdId: string) {
  const [row] = await db
    .select({ total: count() })
    .from(users)
    .where(and(eq(users.householdId, householdId), eq(users.role, "admin")))
  return row?.total ?? 0
}

export async function findUserByUsername(db: Db, username: string) {
  const [row] = await db
    .select()
    .from(users)
    .where(eq(users.username, username.toLowerCase()))
    .limit(1)
  return row
}

export async function findUserById(db: Db, id: string) {
  const [row] = await db.select().from(users).where(eq(users.id, id)).limit(1)
  return row
}

/** Everyone in a household, oldest account first. */
export async function listUsers(db: Db, householdId: string) {
  return db
    .select()
    .from(users)
    .where(eq(users.householdId, householdId))
    .orderBy(asc(users.createdAt))
}

export async function createUser(
  db: Db,
  input: {
    username: string
    displayName: string
    password: string
    householdId: string
    role: Role
    isServerAdmin?: boolean
  }
) {
  if (await findUserByUsername(db, input.username)) {
    throw new HttpError(409, "That username is taken", {
      fields: { username: "That username is taken" },
    })
  }
  const [row] = await db
    .insert(users)
    .values({
      username: input.username.toLowerCase(),
      displayName: input.displayName,
      passwordHash: await hashPassword(input.password),
      householdId: input.householdId,
      role: input.role,
      isServerAdmin: input.isServerAdmin ?? false,
    })
    .returning()
  return row!
}

export async function updateUser(
  db: Db,
  id: string,
  patch: {
    displayName?: string
    role?: Role
    appearance?: Appearance
    password?: string
  }
) {
  const { password, ...rest } = patch
  const [row] = await db
    .update(users)
    .set({
      ...rest,
      ...(password ? { passwordHash: await hashPassword(password) } : {}),
    })
    .where(eq(users.id, id))
    .returning()
  if (!row) throw new HttpError(404, "That person isn't in this household")
  return row
}

export async function deleteUser(db: Db, id: string) {
  await db.delete(users).where(eq(users.id, id))
}
