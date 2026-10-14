import type { CleanupJob, PhotoLibrary, Recipe } from "@mise/shared"
import { and, asc, desc, eq, isNull } from "drizzle-orm"
import { z } from "zod"

import type { AiActor, AiService } from "../ai/service.ts"
import type { Db } from "../db/client.ts"
import { aiJobs, recipes } from "../db/schema.ts"
import { HttpError } from "../http.ts"
import { deleteImage, saveImage } from "./images.ts"
import { findRecipeRow, getRecipe, setRecipeFields } from "./recipes.ts"

export type PhotoService = ReturnType<typeof createPhotoService>

/**
 * The house style, the same for every photo, so they look like one
 * cookbook: a dark plate on white marble, in soft daylight.
 */
const STYLE = `Style: a realistic, appetizing food photograph for a modern cookbook. The food is plated on a matte charcoal-black stoneware plate, or in a matching dark stoneware bowl for a soup, stew, curry, noodles, salad, sauce, dip or drink. It sits on a white Carrara marble counter with soft grey veining. Soft natural daylight from the left with gentle shadows, shot from about 45 degrees with a shallow depth of field, the dish filling most of the frame. Minimal styling: at most a folded linen napkin or a fresh garnish that belongs in the recipe. True-to-life colors. No text, labels, logos, hands, people or cluttered props.`

/** Ingredients that don't say anything about how a dish looks. */
const UNSEEN =
  /^(?:kosher |sea |table )?salt$|^(?:black |white )?pepper$|^water$|^ice$|^cooking spray$|^(?:olive |vegetable |canola |neutral )?oil$/i

/** What to picture: the dish, what's in it, and how it's served (often in the last steps). */
export function photoPrompt(recipe: Recipe) {
  const foods = [
    ...new Set(
      recipe.ingredients
        .map((i) => (i.food ?? i.text).trim().toLowerCase())
        .filter((food) => food && !UNSEEN.test(food))
    ),
  ].slice(0, 12)
  const serving = recipe.steps
    .slice(-2)
    .map((step) => step.text)
    .join(" ")
    .slice(0, 500)
  return [
    `A photograph of ${recipe.name}, finished and ready to eat.`,
    recipe.description && `About the dish: ${recipe.description.slice(0, 400)}`,
    foods.length > 0 && `Made with: ${foods.join(", ")}.`,
    serving && `How it's finished: ${serving}`,
    STYLE,
  ]
    .filter(Boolean)
    .join("\n\n")
}

export function createPhotoService(
  db: Db,
  ai: AiService,
  options: {
    /** Make photos for new recipes in the background (off in tests). */
    auto?: boolean
  } = {}
) {
  /** One photo at a time per recipe; asking again waits for the first. */
  const making = new Map<string, Promise<Recipe>>()
  /** New recipes whose photo is about to be made in the background. */
  const queued = new Set<string>()

  /** Whether a photo is being made for this recipe right now, so the page can wait for it. */
  async function isMaking(householdId: string, idOrSlug: string) {
    const row = await findRecipeRow(db, householdId, idOrSlug)
    return making.has(row.id) || queued.has(row.id)
  }

  /**
   * Makes a photo for a recipe and saves it. Only for recipes without a
   * photo, or with an AI one (which it replaces); a real photo stays.
   */
  async function make(
    actor: AiActor & { householdId: string },
    idOrSlug: string
  ): Promise<Recipe> {
    const recipe = await getRecipe(db, actor.householdId, idOrSlug)
    const already = making.get(recipe.id)
    if (already) return already
    if (recipe.imageUrl && !recipe.photoByAi) {
      throw new HttpError(409, "This recipe has a photo already")
    }
    const run = (async () => {
      const image = await ai.generateImage(actor, photoPrompt(recipe))
      const name = await saveImage(image)
      // A photo may have been added while this one was being made: keep it.
      const row = await findRecipeRow(db, actor.householdId, recipe.id)
      if (row.image && !row.imageAi) {
        await deleteImage(name)
        return getRecipe(db, actor.householdId, recipe.id)
      }
      const saved = await setRecipeFields(db, actor.householdId, recipe.id, {
        image: name,
        imageAi: true,
      })
      await deleteImage(row.image)
      return saved
    })()
    making.set(recipe.id, run)
    try {
      return await run
    } finally {
      making.delete(recipe.id)
    }
  }

  /** A new recipe without a photo gets one, in the background, when the server allows. */
  function afterCreate(
    actor: AiActor & { householdId: string },
    recipe: Recipe
  ) {
    if (options.auto === false || recipe.imageUrl) return
    queued.add(recipe.id)
    void (async () => {
      if (!(await ai.autoPhotos())) return
      await make(actor, recipe.id)
    })()
      .catch((error: Error) =>
        console.warn(`Couldn't make a photo for ${recipe.name}:`, error.message)
      )
      .finally(() => queued.delete(recipe.id))
  }

  // ---- The whole library ----

  /** Library runs going in this process, so they can be stopped. */
  const runs = new Map<string, { cancelled: boolean }>()

  /** Recipes without a photo, oldest first. */
  async function missing(householdId: string) {
    const rows = await db
      .select({ id: recipes.id })
      .from(recipes)
      .where(and(eq(recipes.householdId, householdId), isNull(recipes.image)))
      .orderBy(asc(recipes.createdAt))
    return rows.map((row) => row.id)
  }

  function toJob(row: typeof aiJobs.$inferSelect): CleanupJob {
    return {
      id: row.id,
      status: row.status,
      total: row.total,
      done: row.done,
      failed: row.failed,
      proposals: 0,
      createdAt: row.createdAt.toISOString(),
      finishedAt: row.finishedAt?.toISOString() ?? null,
    }
  }

  async function libraryStatus(householdId: string): Promise<PhotoLibrary> {
    const [row] = await db
      .select()
      .from(aiJobs)
      .where(
        and(eq(aiJobs.kind, "photos"), eq(aiJobs.householdId, householdId))
      )
      .orderBy(desc(aiJobs.createdAt))
      .limit(1)
    return {
      job: row ? toJob(row) : null,
      missing: (await missing(householdId)).length,
      available: (await ai.status()).images,
    }
  }

  /** Makes photos for every recipe without one, in the background, two at a time. */
  async function startLibraryRun(actor: {
    userId: string
    householdId: string
  }) {
    const { householdId } = actor
    const [active] = await db
      .select({ id: aiJobs.id })
      .from(aiJobs)
      .where(
        and(
          eq(aiJobs.kind, "photos"),
          eq(aiJobs.householdId, householdId),
          eq(aiJobs.status, "running")
        )
      )
    if (active) throw new HttpError(409, "Photos are already being made")
    if (!(await ai.status()).images) {
      throw new HttpError(
        400,
        "Making photos needs an OpenAI key. The server admin can add one in Settings → AI."
      )
    }
    const ids = await missing(householdId)
    if (!ids.length) throw new HttpError(400, "Every recipe has a photo")
    const [row] = await db
      .insert(aiJobs)
      .values({
        householdId,
        kind: "photos",
        status: "running",
        total: ids.length,
        createdBy: actor.userId,
      })
      .returning()
    const job = row!
    const control = { cancelled: false }
    runs.set(job.id, control)

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
            await make(actor, id)
            done++
            failuresInARow = 0
          } catch (error) {
            // Given a photo meanwhile: nothing to do.
            if (error instanceof HttpError && error.status === 409) {
              done++
            } else {
              failed++
              failuresInARow++
              console.warn(
                `Photo for recipe ${id} failed:`,
                (error as Error).message
              )
              // The same problem three times (a key, credit, verification): stop.
              if (failuresInARow >= 3) {
                status = "failed"
                control.cancelled = true
              }
            }
          }
          await db
            .update(aiJobs)
            .set({ done, failed })
            .where(eq(aiJobs.id, job.id))
        }
      }

      try {
        await Promise.all([worker(), worker()])
      } catch (error) {
        status = "failed"
        console.error("Library photo run stopped:", error)
      }
      if (control.cancelled && status === "done") status = "cancelled"
      runs.delete(job.id)
      await db
        .update(aiJobs)
        .set({ status, done, failed, finishedAt: new Date() })
        .where(eq(aiJobs.id, job.id))
    })()

    return toJob(job)
  }

  async function stopLibraryRun(householdId: string, id: string) {
    const [row] = z.uuid().safeParse(id).success
      ? await db
          .select()
          .from(aiJobs)
          .where(and(eq(aiJobs.id, id), eq(aiJobs.householdId, householdId)))
      : []
    const control = row && runs.get(row.id)
    if (!row || !control) throw new HttpError(404, "That run isn't going")
    control.cancelled = true
    return toJob(row)
  }

  return {
    make,
    isMaking,
    afterCreate,
    libraryStatus,
    startLibraryRun,
    stopLibraryRun,
  }
}
