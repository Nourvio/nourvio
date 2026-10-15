import { CLEANUP_SECTIONS, type CleanupJob } from "@mise/shared"
import { and, asc, count, desc, eq, notExists } from "drizzle-orm"

import type { AiService } from "../ai/service.ts"
import type { Db } from "../db/client.ts"
import { aiJobs, proposals, recipes } from "../db/schema.ts"
import { z } from "zod"

import { HttpError } from "../http.ts"
import { proposeCleanup } from "./cleanup.ts"
import { notDeleted } from "./recipes.ts"

/** Two at a time: quicker than one, gentle on rate limits. */
const CONCURRENCY = 2
/** This many failures in a row (a bad key, no credit) stops the run. */
const MAX_FAILURES_IN_A_ROW = 3

/** Runs in progress in this process, so they can be cancelled. */
const running = new Map<string, { cancelled: boolean }>()

type JobRow = typeof aiJobs.$inferSelect

async function toJob(db: Db, row: JobRow): Promise<CleanupJob> {
  const [pending] = await db
    .select({ n: count() })
    .from(proposals)
    .where(and(eq(proposals.jobId, row.id), eq(proposals.status, "pending")))
  return {
    id: row.id,
    status: row.status,
    total: row.total,
    done: row.done,
    failed: row.failed,
    proposals: pending?.n ?? 0,
    createdAt: row.createdAt.toISOString(),
    finishedAt: row.finishedAt?.toISOString() ?? null,
  }
}

/** The household's recipes that have never been through a tidy-up, oldest first. */
async function untidiedRecipeIds(db: Db, householdId: string) {
  const rows = await db
    .select({ id: recipes.id })
    .from(recipes)
    .where(
      and(
        eq(recipes.householdId, householdId),
        notDeleted,
        notExists(
          db
            .select({ id: proposals.id })
            .from(proposals)
            .where(eq(proposals.recipeId, recipes.id))
        )
      )
    )
    .orderBy(asc(recipes.createdAt))
  return rows.map((row) => row.id)
}

export async function countUntidied(db: Db, householdId: string) {
  return (await untidiedRecipeIds(db, householdId)).length
}

/** The household's most recent library run, if there's been one. */
export async function latestCleanupJob(db: Db, householdId: string) {
  const [row] = await db
    .select()
    .from(aiJobs)
    .where(and(eq(aiJobs.kind, "cleanup"), eq(aiJobs.householdId, householdId)))
    .orderBy(desc(aiJobs.createdAt))
    .limit(1)
  return row ? toJob(db, row) : null
}

/**
 * Tidies every recipe that hasn't been tidied yet, in the background. The
 * suggestions land in the review queue; nothing is changed until applied.
 */
export async function startCleanupJob(
  db: Db,
  ai: AiService,
  actor: { userId: string; householdId: string }
) {
  const { userId, householdId } = actor
  const [active] = await db
    .select({ id: aiJobs.id })
    .from(aiJobs)
    .where(
      and(
        eq(aiJobs.kind, "cleanup"),
        eq(aiJobs.householdId, householdId),
        eq(aiJobs.status, "running")
      )
    )
  if (active) throw new HttpError(409, "A library tidy-up is already running")
  await ai.resolve("cleanup")

  const ids = await untidiedRecipeIds(db, householdId)
  if (!ids.length) {
    throw new HttpError(400, "Every recipe has already been tidied")
  }
  const [row] = await db
    .insert(aiJobs)
    .values({
      householdId,
      kind: "cleanup",
      status: "running",
      total: ids.length,
      createdBy: userId,
    })
    .returning()
  const job = row!
  const control = { cancelled: false }
  running.set(job.id, control)

  void (async () => {
    let done = 0
    let failed = 0
    let failuresInARow = 0
    let next = 0
    let status: CleanupJob["status"] = "done"

    async function worker() {
      while (next < ids.length && !control.cancelled) {
        const id = ids[next++]!
        try {
          await proposeCleanup(db, ai, householdId, id, {
            userId,
            sections: [...CLEANUP_SECTIONS],
            jobId: job.id,
          })
          done++
          failuresInARow = 0
        } catch (error) {
          failed++
          failuresInARow++
          console.warn(
            `Tidy-up of recipe ${id} failed:`,
            (error as Error).message
          )
          if (failuresInARow >= MAX_FAILURES_IN_A_ROW) {
            status = "failed"
            control.cancelled = true
          }
        }
        await db
          .update(aiJobs)
          .set({ done, failed })
          .where(eq(aiJobs.id, job.id))
      }
    }

    try {
      await Promise.all(Array.from({ length: CONCURRENCY }, worker))
    } catch (error) {
      status = "failed"
      console.error("Library tidy-up stopped:", error)
    }
    if (control.cancelled && status === "done") status = "cancelled"
    running.delete(job.id)
    await db
      .update(aiJobs)
      .set({ status, done, failed, finishedAt: new Date() })
      .where(eq(aiJobs.id, job.id))
  })()

  return toJob(db, job)
}

export async function cancelCleanupJob(
  db: Db,
  householdId: string,
  id: string
) {
  const [row] = z.uuid().safeParse(id).success
    ? await db
        .select()
        .from(aiJobs)
        .where(and(eq(aiJobs.id, id), eq(aiJobs.householdId, householdId)))
    : []
  const control = row && running.get(row.id)
  if (!row || !control) throw new HttpError(404, "That run isn't going")
  control.cancelled = true
  return toJob(db, row)
}

/** After a restart, runs that were going can't continue; say so. */
export async function markInterruptedJobs(db: Db) {
  await db
    .update(aiJobs)
    .set({ status: "interrupted", finishedAt: new Date() })
    .where(eq(aiJobs.status, "running"))
}
