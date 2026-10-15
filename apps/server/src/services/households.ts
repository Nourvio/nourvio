import { createHash, randomBytes } from "node:crypto"

import {
  DEFAULT_AUTO_PLAN,
  DEFAULT_MEALS,
  DEFAULT_ON_HAND,
  INVITE_DAYS,
  MEALS,
  NO_TASTES,
  NO_THEMES,
  tidyOnHand,
  type AutoPlan,
  type Meal,
  type CreatedInvite,
  type Household,
  type HouseholdTastes,
  type HouseholdSummary,
  type Invite,
  type InvitePreview,
  type Role,
  type ServerSettings,
  DEFAULT_LISTS,
  MAIN_LIST,
  type ShoppingList,
  type WeekThemes,
} from "@mise/shared"
import {
  and,
  asc,
  count,
  desc,
  eq,
  gt,
  gte,
  isNotNull,
  isNull,
  notInArray,
  sql,
} from "drizzle-orm"
import { alias } from "drizzle-orm/pg-core"
import { z } from "zod"

import type { Db } from "../db/client.ts"
import {
  aiUsage,
  households,
  invites,
  recipes,
  settings,
  users,
  foodLists,
  shoppingItems,
} from "../db/schema.ts"
import { HttpError } from "../http.ts"
import { deleteImage } from "./images.ts"
import { createUser } from "./users.ts"

type HouseholdRow = typeof households.$inferSelect

function toHousehold(row: HouseholdRow): Household {
  return {
    id: row.id,
    name: row.name,
    autoCleanup: row.settings.autoCleanup ?? false,
    meals: row.settings.meals ?? DEFAULT_MEALS,
    weekStart: row.settings.weekStart ?? 0,
    onHand: tidyOnHand(row.settings.onHand ?? DEFAULT_ON_HAND),
    tastes: { ...NO_TASTES, ...row.settings.tastes },
    autoPlan: { ...DEFAULT_AUTO_PLAN, ...row.settings.autoPlan },
    lists: row.settings.lists?.length ? row.settings.lists : DEFAULT_LISTS,
    themes: row.settings.themes?.length === 7 ? row.settings.themes : NO_THEMES,
    weeklyBudget: row.settings.weeklyBudget ?? null,
  }
}

export async function createHousehold(db: Db, name: string) {
  const [row] = await db.insert(households).values({ name }).returning()
  return row!
}

export async function getHousehold(db: Db, id: string) {
  const [row] = await db.select().from(households).where(eq(households.id, id))
  if (!row) throw new HttpError(404, "That household doesn't exist")
  return toHousehold(row)
}

export async function updateHousehold(
  db: Db,
  id: string,
  patch: {
    name?: string
    autoCleanup?: boolean
    meals?: Meal[]
    weekStart?: 0 | 1
    onHand?: string[]
    tastes?: HouseholdTastes
    autoPlan?: AutoPlan
    themes?: WeekThemes
    weeklyBudget?: number | null
  }
) {
  const [current] = await db
    .select()
    .from(households)
    .where(eq(households.id, id))
  if (!current) throw new HttpError(404, "That household doesn't exist")
  const [row] = await db
    .update(households)
    .set({
      ...(patch.name ? { name: patch.name } : {}),
      settings: {
        ...current.settings,
        ...(patch.autoCleanup === undefined
          ? {}
          : { autoCleanup: patch.autoCleanup }),
        // Kept in day order, whatever order they were ticked in.
        ...(patch.meals
          ? { meals: MEALS.filter((meal) => patch.meals!.includes(meal)) }
          : {}),
        ...(patch.weekStart === undefined
          ? {}
          : { weekStart: patch.weekStart }),
        ...(patch.onHand ? { onHand: tidyOnHand(patch.onHand) } : {}),
        ...(patch.tastes ? { tastes: patch.tastes } : {}),
        ...(patch.autoPlan ? { autoPlan: patch.autoPlan } : {}),
        ...(patch.themes ? { themes: patch.themes } : {}),
        ...(patch.weeklyBudget === undefined
          ? {}
          : { weeklyBudget: patch.weeklyBudget }),
      },
    })
    .where(eq(households.id, id))
    .returning()
  return toHousehold(row!)
}

/**
 * Saves the household's lists. Things on a list that's gone move to the
 * main list, and foods remembered for it are forgotten.
 */
export async function saveLists(db: Db, id: string, lists: ShoppingList[]) {
  const [current] = await db
    .select()
    .from(households)
    .where(eq(households.id, id))
  if (!current) throw new HttpError(404, "That household doesn't exist")
  const kept = lists.map((list) => list.id)
  await db
    .update(shoppingItems)
    .set({ listId: null })
    .where(
      and(
        eq(shoppingItems.householdId, id),
        isNotNull(shoppingItems.listId),
        notInArray(shoppingItems.listId, kept)
      )
    )
  await db
    .delete(foodLists)
    .where(
      and(eq(foodLists.householdId, id), notInArray(foodLists.listId, kept))
    )
  // The main list first.
  const ordered = [
    ...lists.filter((list) => list.id === MAIN_LIST),
    ...lists.filter((list) => list.id !== MAIN_LIST),
  ]
  const [row] = await db
    .update(households)
    .set({ settings: { ...current.settings, lists: ordered } })
    .where(eq(households.id, id))
    .returning()
  return toHousehold(row!)
}

/**
 * Sets up a new household with its first person, an admin. Used by first-run
 * setup and by open sign-up.
 */
export async function createHouseholdWithAdmin(
  db: Db,
  input: {
    householdName: string
    displayName: string
    username: string
    password: string
    isServerAdmin?: boolean
  }
) {
  const household = await createHousehold(db, input.householdName)
  try {
    return await createUser(db, {
      displayName: input.displayName,
      username: input.username,
      password: input.password,
      householdId: household.id,
      role: "admin",
      isServerAdmin: input.isServerAdmin ?? false,
    })
  } catch (error) {
    // Username taken: don't leave an empty household behind.
    await db.delete(households).where(eq(households.id, household.id))
    throw error
  }
}

// ---- Invites ----

const hashToken = (token: string) =>
  createHash("sha256").update(token).digest("hex")

const inviter = alias(users, "inviter")

/** A single-use link into the household, good for a week. */
export async function createInvite(
  db: Db,
  householdId: string,
  role: Role,
  createdBy: string
): Promise<CreatedInvite> {
  const token = randomBytes(24).toString("base64url")
  const [row] = await db
    .insert(invites)
    .values({
      householdId,
      tokenHash: hashToken(token),
      role,
      createdBy,
      expiresAt: new Date(Date.now() + INVITE_DAYS * 24 * 60 * 60_000),
    })
    .returning()
  const [creator] = await db
    .select({ name: users.displayName })
    .from(users)
    .where(eq(users.id, createdBy))
  return {
    id: row!.id,
    role: row!.role,
    createdBy: creator?.name ?? null,
    createdAt: row!.createdAt.toISOString(),
    expiresAt: row!.expiresAt.toISOString(),
    token,
  }
}

/** Invites that can still be used. */
export async function listInvites(
  db: Db,
  householdId: string
): Promise<Invite[]> {
  const rows = await db
    .select({ invite: invites, createdBy: inviter.displayName })
    .from(invites)
    .leftJoin(inviter, eq(invites.createdBy, inviter.id))
    .where(
      and(
        eq(invites.householdId, householdId),
        isNull(invites.usedAt),
        gt(invites.expiresAt, new Date())
      )
    )
    .orderBy(desc(invites.createdAt))
  return rows.map(({ invite, createdBy }) => ({
    id: invite.id,
    role: invite.role,
    createdBy,
    createdAt: invite.createdAt.toISOString(),
    expiresAt: invite.expiresAt.toISOString(),
  }))
}

export async function revokeInvite(db: Db, householdId: string, id: string) {
  if (!z.uuid().safeParse(id).success) return
  await db
    .delete(invites)
    .where(and(eq(invites.id, id), eq(invites.householdId, householdId)))
}

/** The invite behind a link, if it still works. */
async function findUsableInvite(db: Db, token: string) {
  const [row] = await db
    .select({
      invite: invites,
      householdName: households.name,
      invitedBy: inviter.displayName,
    })
    .from(invites)
    .innerJoin(households, eq(invites.householdId, households.id))
    .leftJoin(inviter, eq(invites.createdBy, inviter.id))
    .where(eq(invites.tokenHash, hashToken(token)))
  if (!row) {
    throw new HttpError(
      404,
      "That invite link doesn't work. Ask for a new one."
    )
  }
  if (row.invite.usedAt) {
    throw new HttpError(
      410,
      "That invite link has already been used. Ask for a new one."
    )
  }
  if (row.invite.expiresAt <= new Date()) {
    throw new HttpError(410, "That invite link has expired. Ask for a new one.")
  }
  return row
}

export async function previewInvite(
  db: Db,
  token: string
): Promise<InvitePreview> {
  const { invite, householdName, invitedBy } = await findUsableInvite(db, token)
  return {
    householdName,
    invitedBy,
    role: invite.role,
    expiresAt: invite.expiresAt.toISOString(),
  }
}

/** Creates the new person's account in the inviting household and uses up the link. */
export async function acceptInvite(
  db: Db,
  token: string,
  input: { displayName: string; username: string; password: string }
) {
  const { invite } = await findUsableInvite(db, token)
  // Claim the link first, so two people can't both use it.
  const claimed = await db
    .update(invites)
    .set({ usedAt: new Date() })
    .where(and(eq(invites.id, invite.id), isNull(invites.usedAt)))
    .returning({ id: invites.id })
  if (!claimed.length) {
    throw new HttpError(
      410,
      "That invite link has already been used. Ask for a new one."
    )
  }
  try {
    const user = await createUser(db, {
      ...input,
      householdId: invite.householdId,
      role: invite.role,
    })
    await db
      .update(invites)
      .set({ usedBy: user.id })
      .where(eq(invites.id, invite.id))
    return user
  } catch (error) {
    // Username taken, say: give the link back so they can try again.
    await db
      .update(invites)
      .set({ usedAt: null })
      .where(eq(invites.id, invite.id))
    throw error
  }
}

// ---- Server ----

const SERVER_SETTINGS_KEY = "server"

export async function getServerSettings(db: Db): Promise<ServerSettings> {
  const [row] = await db
    .select({ value: settings.value })
    .from(settings)
    .where(eq(settings.key, SERVER_SETTINGS_KEY))
  const value = (row?.value ?? {}) as Partial<ServerSettings>
  return { signupOpen: value.signupOpen ?? false }
}

export async function updateServerSettings(
  db: Db,
  patch: Partial<ServerSettings>
) {
  const value = { ...(await getServerSettings(db)), ...patch }
  await db
    .insert(settings)
    .values({ key: SERVER_SETTINGS_KEY, value })
    .onConflictDoUpdate({ target: settings.key, set: { value } })
  return value
}

/** Every household, with its size and this month's AI use, for the server admin. */
export async function listHouseholdSummaries(
  db: Db,
  yours: string
): Promise<HouseholdSummary[]> {
  const monthStart = new Date()
  monthStart.setDate(1)
  monthStart.setHours(0, 0, 0, 0)

  const rows = await db
    .select()
    .from(households)
    .orderBy(asc(households.createdAt))
  const memberCounts = await db
    .select({ id: users.householdId, n: count() })
    .from(users)
    .groupBy(users.householdId)
  const recipeCounts = await db
    .select({ id: recipes.householdId, n: count() })
    .from(recipes)
    .groupBy(recipes.householdId)
  const usage = await db
    .select({
      id: aiUsage.householdId,
      requests: count(),
      cost: sql<number | null>`sum(${aiUsage.costUsd})`,
    })
    .from(aiUsage)
    .where(
      and(isNotNull(aiUsage.householdId), gte(aiUsage.createdAt, monthStart))
    )
    .groupBy(aiUsage.householdId)

  const byId = <T extends { id: string | null }>(list: T[]) =>
    new Map(list.map((item) => [item.id, item]))
  const members = byId(memberCounts)
  const recipeTotals = byId(recipeCounts)
  const spend = byId(usage)
  return rows.map((row) => {
    const used = spend.get(row.id)
    return {
      id: row.id,
      name: row.name,
      members: members.get(row.id)?.n ?? 0,
      recipes: recipeTotals.get(row.id)?.n ?? 0,
      createdAt: row.createdAt.toISOString(),
      aiRequests: used?.requests ?? 0,
      aiCostUsd:
        used?.cost === null || used?.cost === undefined
          ? null
          : Number(used.cost),
      isYours: row.id === yours,
    }
  })
}

/** Removes a household with everyone and everything in it, photos included. */
export async function deleteHousehold(db: Db, id: string) {
  if (!z.uuid().safeParse(id).success) {
    throw new HttpError(404, "That household doesn't exist")
  }
  const photos = await db
    .select({ image: recipes.image })
    .from(recipes)
    .where(and(eq(recipes.householdId, id), isNotNull(recipes.image)))
  const deleted = await db
    .delete(households)
    .where(eq(households.id, id))
    .returning({ id: households.id })
  if (!deleted.length) throw new HttpError(404, "That household doesn't exist")
  for (const { image } of photos) await deleteImage(image)
}
