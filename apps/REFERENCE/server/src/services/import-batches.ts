import {
  findLinks,
  type ImportBatch,
  type ImportBatchInput,
  type ImportBatchSummary,
  type ImportItemState,
  type LinkPreview,
} from "@mise/shared"
import { and, asc, desc, eq, gt, inArray, isNull, lt } from "drizzle-orm"
import { z } from "zod"

import type { AiService } from "../ai/service.ts"
import type { Db } from "../db/client.ts"
import { importBatchItems, importBatches, recipes } from "../db/schema.ts"
import { HttpError } from "../http.ts"
import { inLibrary, isVideoUrl, normalizeUrl } from "../import/links.ts"
import type { Fetcher } from "../import/safe-fetch.ts"
import { importFromUrl } from "../import/url.ts"
import type { VideoTools } from "../import/video-tools.ts"
import type { EventBus } from "./events.ts"
import type { AfterImport } from "./import-follow-up.ts"
import { imageUrls } from "./images.ts"
import { tagRecipes } from "./recipes.ts"

/** Recipe pages read at once; videos are heavier, so one at a time. */
const AT_ONCE = { page: 3, video: 1 } as const
/** Links in one go, as the import's input allows. */
const MAX_LINKS = 100
/** Recipes shows a bulk import this long after it starts. */
const CURRENT_MS = 24 * 60 * 60_000
/** Finished imports are forgotten after this. */
const KEEP_DAYS = 30

type ItemRow = typeof importBatchItems.$inferSelect
type BatchRow = typeof importBatches.$inferSelect

const uuid = z.uuid()

/** The link tidied the way imports store it, or null when it isn't one. */
function tidy(raw: string) {
  try {
    return normalizeUrl(raw)
  } catch {
    return null
  }
}

const kindOf = (url: string): LinkPreview["kind"] =>
  isVideoUrl(url) ? "video" : "page"

/**
 * Many links imported in the background, so it carries on after the page
 * closes and after a restart: each one through the usual link import (and
 * its follow-up), recipe pages three at a time and videos one at a time.
 * Open pages hear how it's going through the live events stream.
 */
export function createImportBatchService(
  db: Db,
  {
    ai,
    fetcher,
    videoTools,
    afterImport,
    events,
  }: {
    ai: AiService
    fetcher: Fetcher
    videoTools: VideoTools
    afterImport: AfterImport
    events: EventBus
  }
) {
  /** Batches being worked through now, in this process. */
  const running = new Set<string>()
  /** Batches given more to do while running (Try again). */
  const again = new Set<string>()

  const changed = (householdId: string, batchId: string) =>
    events.publish(householdId, { type: "imports", batchId })

  async function batchRow(householdId: string, id: string) {
    if (!uuid.safeParse(id).success) return null
    const [row] = await db
      .select()
      .from(importBatches)
      .where(
        and(
          eq(importBatches.id, id),
          eq(importBatches.householdId, householdId)
        )
      )
    return row ?? null
  }

  async function found(householdId: string, id: string) {
    const row = await batchRow(householdId, id)
    if (!row) throw new HttpError(404, "That import isn't here any more")
    return row
  }

  /** The links in some pasted text, and which are in the library already. */
  async function preview(householdId: string, text: string) {
    const urls = [
      ...new Set(
        findLinks(text)
          .map(tidy)
          .filter((url): url is string => url !== null)
      ),
    ]
    const kept = urls.slice(0, MAX_LINKS)
    const existing = await inLibrary(db, householdId, kept)
    const links: LinkPreview[] = kept.map((url) => ({
      url,
      kind: kindOf(url),
      existing: existing.get(url) ?? null,
    }))
    return { links, more: urls.length - kept.length }
  }

  async function get(householdId: string, id: string): Promise<ImportBatch> {
    const batch = await found(householdId, id)
    const items = await db
      .select({
        item: importBatchItems,
        recipe: {
          id: recipes.id,
          slug: recipes.slug,
          name: recipes.name,
          image: recipes.image,
        },
      })
      .from(importBatchItems)
      .leftJoin(
        recipes,
        and(
          eq(recipes.id, importBatchItems.recipeId),
          isNull(recipes.deletedAt)
        )
      )
      .where(eq(importBatchItems.batchId, id))
      .orderBy(asc(importBatchItems.position))
    return {
      id: batch.id,
      createdAt: batch.createdAt.toISOString(),
      finishedAt: batch.finishedAt?.toISOString() ?? null,
      tag: batch.tag,
      items: items.map(({ item, recipe }) => ({
        id: item.id,
        url: item.url,
        kind: item.kind,
        state: item.state,
        recipe: recipe
          ? {
              id: recipe.id,
              slug: recipe.slug,
              name: recipe.name,
              thumbnailUrl: imageUrls(recipe.image).thumbnailUrl,
            }
          : null,
        error: item.error,
      })),
    }
  }

  /** The household's latest bulk import from today, for the chip on Recipes. */
  async function current(
    householdId: string
  ): Promise<ImportBatchSummary | null> {
    const [batch] = await db
      .select()
      .from(importBatches)
      .where(
        and(
          eq(importBatches.householdId, householdId),
          gt(importBatches.createdAt, new Date(Date.now() - CURRENT_MS))
        )
      )
      .orderBy(desc(importBatches.createdAt))
      .limit(1)
    if (!batch) return null
    const states = await db
      .select({ state: importBatchItems.state })
      .from(importBatchItems)
      .where(eq(importBatchItems.batchId, batch.id))
    const count = (...of: ImportItemState[]) =>
      states.filter((item) => of.includes(item.state)).length
    return {
      id: batch.id,
      total: states.length,
      done: states.length - count("waiting", "importing"),
      added: count("added"),
      failed: count("failed"),
      finishedAt: batch.finishedAt?.toISOString() ?? null,
    }
  }

  /** Imports one link, unless it was stopped before its turn came. */
  async function importOne(batch: BatchRow, item: ItemRow) {
    const [claimed] = await db
      .update(importBatchItems)
      .set({ state: "importing", error: null })
      .where(
        and(
          eq(importBatchItems.id, item.id),
          eq(importBatchItems.state, "waiting")
        )
      )
      .returning({ id: importBatchItems.id })
    if (!claimed) return
    changed(batch.householdId, batch.id)

    let state: ImportItemState
    let recipeId: string | null = null
    let error: string | null = null
    try {
      if (!batch.userId) {
        throw new HttpError(410, "Whoever started this import has left")
      }
      const actor = { userId: batch.userId, householdId: batch.householdId }
      const result = await importFromUrl(db, item.url, {
        ...actor,
        fetcher,
        ai,
        videoTools,
      })
      recipeId = result.recipe.id
      state = result.duplicate ? "duplicate" : "added"
      if (!result.duplicate && batch.tag) {
        await tagRecipes(db, batch.householdId, [recipeId], [batch.tag], true)
      }
      // The recipe's in; nutrition or a photo failing doesn't change that.
      await afterImport(result, actor).catch((failure: Error) =>
        console.warn("After a bulk import:", failure.message)
      )
    } catch (failure) {
      state = "failed"
      if (failure instanceof HttpError) {
        error = failure.message
      } else {
        error = "Something went wrong importing this"
        console.warn(`Bulk import of ${item.url} failed:`, failure)
      }
    }
    await db
      .update(importBatchItems)
      .set({ state, recipeId, error })
      .where(eq(importBatchItems.id, item.id))
    changed(batch.householdId, batch.id)
  }

  /** Works through the batch's waiting links until none are left. */
  async function work(id: string) {
    const [batch] = await db
      .update(importBatches)
      .set({ finishedAt: null })
      .where(eq(importBatches.id, id))
      .returning()
    if (!batch) return
    for (;;) {
      const waiting = await db
        .select()
        .from(importBatchItems)
        .where(
          and(
            eq(importBatchItems.batchId, id),
            eq(importBatchItems.state, "waiting")
          )
        )
        .orderBy(asc(importBatchItems.position))
      if (!waiting.length) break
      await Promise.all(
        (["page", "video"] as const).map(async (kind) => {
          const queue = waiting.filter((item) => item.kind === kind)
          const lanes = Math.min(AT_ONCE[kind], queue.length)
          await Promise.all(
            Array.from({ length: lanes }, async () => {
              for (let item = queue.shift(); item; item = queue.shift()) {
                await importOne(batch, item)
              }
            })
          )
        })
      )
    }
    await db
      .update(importBatches)
      .set({ finishedAt: new Date() })
      .where(eq(importBatches.id, id))
    changed(batch.householdId, id)
  }

  function run(id: string) {
    if (running.has(id)) {
      again.add(id)
      return
    }
    running.add(id)
    void work(id)
      .catch((error) => console.error("A bulk import stopped:", error))
      .finally(() => {
        running.delete(id)
        if (again.delete(id)) run(id)
      })
  }

  /** Starts importing these links; returns the batch to follow. */
  async function start(
    actor: { userId: string; householdId: string },
    input: ImportBatchInput
  ) {
    const urls = [
      ...new Set(
        input.urls.map(tidy).filter((url): url is string => url !== null)
      ),
    ]
    if (!urls.length) {
      throw new HttpError(400, "None of those look like links")
    }
    // Old imports are only clutter.
    await db
      .delete(importBatches)
      .where(
        and(
          eq(importBatches.householdId, actor.householdId),
          lt(
            importBatches.finishedAt,
            new Date(Date.now() - KEEP_DAYS * 86_400_000)
          )
        )
      )
    const id = await db.transaction(async (tx) => {
      const [batch] = await tx
        .insert(importBatches)
        .values({
          householdId: actor.householdId,
          userId: actor.userId,
          tag: input.tag?.trim() || null,
        })
        .returning({ id: importBatches.id })
      await tx.insert(importBatchItems).values(
        urls.map((url, position) => ({
          householdId: actor.householdId,
          batchId: batch!.id,
          position,
          url,
          kind: kindOf(url),
        }))
      )
      return batch!.id
    })
    run(id)
    return get(actor.householdId, id)
  }

  /** Stops the links still waiting; ones already going finish. */
  async function stop(householdId: string, id: string) {
    const batch = await found(householdId, id)
    await db
      .update(importBatchItems)
      .set({ state: "stopped" })
      .where(
        and(
          eq(importBatchItems.batchId, batch.id),
          eq(importBatchItems.state, "waiting")
        )
      )
    changed(householdId, id)
    return get(householdId, id)
  }

  /** Tries the links that didn't work (or were stopped) again, or just one. */
  async function retry(householdId: string, id: string, itemId?: string) {
    const batch = await found(householdId, id)
    if (itemId && !uuid.safeParse(itemId).success) {
      throw new HttpError(404, "That link isn't in this import")
    }
    const retried = await db
      .update(importBatchItems)
      .set({ state: "waiting", error: null })
      .where(
        and(
          eq(importBatchItems.batchId, batch.id),
          inArray(importBatchItems.state, ["failed", "stopped"]),
          itemId ? eq(importBatchItems.id, itemId) : undefined
        )
      )
      .returning({ id: importBatchItems.id })
    if (retried.length) {
      changed(householdId, id)
      run(id)
    }
    return get(householdId, id)
  }

  /**
   * After a restart: links that were mid-import go back in line, and
   * unfinished batches carry on.
   */
  async function resume() {
    await db
      .update(importBatchItems)
      .set({ state: "waiting" })
      .where(eq(importBatchItems.state, "importing"))
    const unfinished = await db
      .select({ id: importBatches.id })
      .from(importBatches)
      .where(isNull(importBatches.finishedAt))
    for (const batch of unfinished) run(batch.id)
    return unfinished.length
  }

  /** Whether any batch is being worked through (for tests). */
  const busy = () => running.size > 0

  return { preview, start, get, current, stop, retry, resume, busy }
}

export type ImportBatchService = ReturnType<typeof createImportBatchService>
