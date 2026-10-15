import type {
  MealieCheck,
  MealieJob,
  Nutrition,
  RecipeInput,
} from "@mise/shared"
import { and, count, desc, eq, inArray, like } from "drizzle-orm"

import type { Db } from "../db/client.ts"
import { aiJobs, recipes } from "../db/schema.ts"
import { HttpError } from "../http.ts"
import { saveImage } from "../services/images.ts"
import { createRecipe } from "../services/recipes.ts"
import { cleanText, parseDuration, parseYield } from "./jsonld.ts"

/* eslint-disable @typescript-eslint/no-explicit-any -- Mealie's JSON varies by version */

/**
 * How the importer talks to Mealie. Unlike recipe-site imports this may reach
 * the home network (that's where Mealie lives), so it's admin only and only
 * ever calls the address the admin typed in. Tests pass a fake.
 */
export type MealieFetch = (url: string, init: RequestInit) => Promise<Response>

const CONCURRENCY = 3
const PAGE_SIZE = 50

function client(base: string, token: string, fetcher: MealieFetch) {
  const root = base.replace(/\/+$/, "")

  async function request(path: string) {
    let response: Response
    try {
      response = await fetcher(`${root}${path}`, {
        headers: {
          authorization: `Bearer ${token}`,
          accept: "application/json",
        },
        signal: AbortSignal.timeout(30_000),
      })
    } catch (error) {
      const cause = (error as { cause?: { code?: string } }).cause?.code
      throw new HttpError(
        502,
        (error as Error).name === "TimeoutError"
          ? "Mealie took too long to answer"
          : `Couldn't reach Mealie at ${root}${cause ? ` (${cause})` : ""}. Use an address the Nourvio server can reach, such as http://192.168.1.20:9000.`
      )
    }
    if (response.status === 401 || response.status === 403) {
      throw new HttpError(400, "Mealie didn't accept that API token", {
        fields: {
          token: "Check the token in Mealie under your profile → API Tokens",
        },
      })
    }
    return response
  }

  async function json(path: string) {
    const response = await request(path)
    if (!response.ok) {
      throw new HttpError(
        502,
        `Mealie answered with an error (${response.status})`
      )
    }
    try {
      return (await response.json()) as any
    } catch {
      throw new HttpError(502, "That doesn't look like Mealie")
    }
  }

  return {
    about: () => json("/api/app/about"),
    page: (page: number, perPage = PAGE_SIZE) =>
      json(
        `/api/recipes?page=${page}&perPage=${perPage}&orderBy=created_at&orderDirection=asc`
      ),
    recipe: (slug: string) => json(`/api/recipes/${encodeURIComponent(slug)}`),
    async image(id: string) {
      const response = await request(
        `/api/media/recipes/${id}/images/original.webp`
      )
      if (!response.ok) return null
      return Buffer.from(await response.arrayBuffer())
    },
  }
}

/** "1 hour 30 minutes", "PT1H30M", "45 min", "90" → minutes. */
export function parseMealieTime(value: unknown): number | null {
  if (typeof value === "number") return value > 0 ? Math.round(value) : null
  if (typeof value !== "string" || !value.trim()) return null
  const iso = parseDuration(value)
  if (iso !== null) return iso
  const text = value.toLowerCase()
  const hours = text.match(/(\d+(?:[.,]\d+)?)\s*(?:h|hr|hrs|hour|hours)\b/)
  const minutes = text.match(/(\d+)\s*(?:m|min|mins|minute|minutes)\b/)
  if (hours || minutes) {
    const total =
      (hours ? Number(hours[1]!.replace(",", ".")) * 60 : 0) +
      (minutes ? Number(minutes[1]) : 0)
    return total > 0 ? Math.round(total) : null
  }
  const plain = text.match(/^\s*(\d+)\s*$/)
  return plain ? Number(plain[1]) || null : null
}

function names(list: unknown): string[] {
  return Array.isArray(list)
    ? list
        .map((item) => (typeof item === "string" ? item : item?.name))
        .filter((name): name is string => typeof name === "string")
    : []
}

function ingredientLine(item: any): string {
  if (typeof item === "string") return item
  const parts = [item?.display, item?.originalText, item?.note]
  for (const part of parts) {
    const text = cleanText(part)
    if (text) return text
  }
  const unit = item?.unit?.name ?? ""
  const food = item?.food?.name ?? ""
  const quantity = item?.quantity ? String(item.quantity) : ""
  return [quantity, unit, food].filter(Boolean).join(" ")
}

function nutritionFrom(value: any): Nutrition | null {
  if (!value || typeof value !== "object") return null
  const number = (key: string) => {
    const match = cleanText(value[key]).match(/\d+(?:[.,]\d+)?/)
    return match ? Number(match[0].replace(",", ".")) : null
  }
  const nutrition: Nutrition = {
    calories: number("calories"),
    fat: number("fatContent"),
    saturatedFat: number("saturatedFatContent"),
    carbohydrates: number("carbohydrateContent"),
    fiber: number("fiberContent"),
    sugar: number("sugarContent"),
    protein: number("proteinContent"),
    sodium: number("sodiumContent"),
    cholesterol: number("cholesterolContent"),
    source: "site",
  }
  return Object.entries(nutrition).some(
    ([k, v]) => k !== "source" && v !== null
  )
    ? nutrition
    : null
}

/** A Mealie recipe (v1 or v2 shape) as editor input, plus what goes alongside it. */
export function fromMealie(recipe: any): {
  input: RecipeInput
  lastMadeAt: Date | null
} {
  const ingredients: string[] = []
  for (const item of Array.isArray(recipe.recipeIngredient)
    ? recipe.recipeIngredient
    : []) {
    const title = cleanText(item?.title)
    if (title) ingredients.push(`# ${title}`)
    const line = ingredientLine(item)
    if (line) ingredients.push(line.slice(0, 500))
  }

  const steps: string[] = []
  for (const step of Array.isArray(recipe.recipeInstructions)
    ? recipe.recipeInstructions
    : []) {
    const title = cleanText(step?.title)
    if (title) steps.push(`# ${title}`)
    const text = cleanText(typeof step === "string" ? step : step?.text)
    if (text) steps.push(text.slice(0, 5000))
  }

  const notes = (Array.isArray(recipe.notes) ? recipe.notes : [])
    .map((note: any) => {
      const title = cleanText(note?.title)
      const text = cleanText(note?.text)
      return title && text ? `${title}: ${text}` : title || text
    })
    .filter(Boolean)
    .join("\n\n")

  const seen = new Set<string>()
  const tags = [...names(recipe.tags), ...names(recipe.recipeCategory)]
    .map((tag) => tag.trim())
    .filter((tag) => {
      const key = tag.toLowerCase()
      if (!tag || tag.length > 40 || seen.has(key)) return false
      seen.add(key)
      return true
    })
    .slice(0, 30)

  const yieldInfo = parseYield(recipe.recipeYield)
  const servings =
    typeof recipe.recipeServings === "number" && recipe.recipeServings > 0
      ? recipe.recipeServings
      : yieldInfo.servings
  const rating =
    typeof recipe.rating === "number" && recipe.rating >= 1
      ? Math.min(5, Math.round(recipe.rating))
      : null
  let sourceUrl: string | null = null
  try {
    sourceUrl = recipe.orgURL ? new URL(String(recipe.orgURL)).toString() : null
  } catch {
    // Not a link; leave it out.
  }
  const lastMade = recipe.lastMade ? new Date(recipe.lastMade) : null
  const description = cleanText(recipe.description)

  return {
    input: {
      name: (cleanText(recipe.name) || "Untitled recipe").slice(0, 200),
      description: description ? description.slice(0, 2000) : null,
      servings: servings && servings <= 1000 ? servings : null,
      yieldText: yieldInfo.yieldText,
      prepMinutes: parseMealieTime(recipe.prepTime),
      // Mealie calls cooking time "performTime"; older versions use cookTime.
      cookMinutes:
        parseMealieTime(recipe.performTime) ?? parseMealieTime(recipe.cookTime),
      totalMinutes: parseMealieTime(recipe.totalTime),
      notes: notes ? notes.slice(0, 5000) : null,
      sourceUrl: sourceUrl && sourceUrl.length <= 2000 ? sourceUrl : null,
      rating,
      tags,
      ingredients: ingredients.slice(0, 300),
      steps: steps.slice(0, 200),
      nutrition: nutritionFrom(recipe.nutrition),
    },
    lastMadeAt: lastMade && !Number.isNaN(lastMade.getTime()) ? lastMade : null,
  }
}

const refFor = (id: string) => `mealie:${id}`

async function importedIds(db: Db, householdId: string, ids: string[]) {
  if (!ids.length) return new Set<string>()
  const rows = await db
    .select({ ref: recipes.externalRef })
    .from(recipes)
    .where(
      and(
        eq(recipes.householdId, householdId),
        inArray(recipes.externalRef, ids.map(refFor))
      )
    )
  return new Set(rows.map((row) => row.ref!.slice("mealie:".length)))
}

/** Connects to Mealie and counts what there is to move. */
export async function checkMealie(
  db: Db,
  householdId: string,
  base: string,
  token: string,
  fetcher: MealieFetch
): Promise<MealieCheck> {
  const mealie = client(base, token, fetcher)
  const about = await mealie.about()
  const first = await mealie.page(1, 1)
  const total = Number(first?.total ?? first?.items?.length ?? 0)
  const [already] = await db
    .select({ n: count() })
    .from(recipes)
    .where(
      and(
        eq(recipes.householdId, householdId),
        like(recipes.externalRef, "mealie:%")
      )
    )
  return {
    version: typeof about?.version === "string" ? about.version : null,
    total,
    alreadyImported: already?.n ?? 0,
  }
}

type JobRow = typeof aiJobs.$inferSelect

function toJob(row: JobRow): MealieJob {
  return {
    id: row.id,
    status: row.status,
    total: row.total,
    imported: row.done,
    skipped: row.skipped,
    failed: row.failed,
    createdAt: row.createdAt.toISOString(),
    finishedAt: row.finishedAt?.toISOString() ?? null,
  }
}

export async function latestMealieJob(db: Db, householdId: string) {
  const [row] = await db
    .select()
    .from(aiJobs)
    .where(and(eq(aiJobs.kind, "mealie"), eq(aiJobs.householdId, householdId)))
    .orderBy(desc(aiJobs.createdAt))
    .limit(1)
  return row ? toJob(row) : null
}

/**
 * Moves every recipe over from Mealie in the background, with its photo,
 * rating and last-made date. Recipes imported before are skipped, so it's
 * safe to run again. The token is only kept in memory for the run.
 */
export async function startMealieImport(
  db: Db,
  base: string,
  token: string,
  options: { userId: string; householdId: string; fetcher: MealieFetch }
) {
  const { householdId } = options
  const [active] = await db
    .select({ id: aiJobs.id })
    .from(aiJobs)
    .where(and(eq(aiJobs.kind, "mealie"), eq(aiJobs.status, "running")))
  if (active) throw new HttpError(409, "A Mealie import is already running")

  const mealie = client(base, token, options.fetcher)
  const first = await mealie.page(1)
  const total = Number(first?.total ?? 0)
  const totalPages = Number(first?.total_pages ?? first?.totalPages ?? 1)
  if (!total) throw new HttpError(400, "There are no recipes in that Mealie")

  const [row] = await db
    .insert(aiJobs)
    .values({
      householdId,
      kind: "mealie",
      status: "running",
      total,
      createdBy: options.userId,
    })
    .returning()
  const job = row!

  void (async () => {
    let imported = 0
    let skipped = 0
    let failed = 0
    let status: MealieJob["status"] = "done"
    const save = () =>
      db
        .update(aiJobs)
        .set({ done: imported, skipped, failed })
        .where(eq(aiJobs.id, job.id))

    async function importOne(summary: any) {
      try {
        const full = await mealie.recipe(summary.slug)
        const { input, lastMadeAt } = fromMealie(full)
        let image: string | null = null
        if (full.id) {
          const photo = await mealie.image(String(full.id)).catch(() => null)
          image = photo ? await saveImage(photo).catch(() => null) : null
        }
        await createRecipe(db, householdId, input, {
          origin: "mealie",
          userId: options.userId,
          image,
          externalRef: refFor(String(full.id ?? summary.id)),
          lastMadeAt,
        })
        imported++
      } catch (error) {
        failed++
        console.warn(
          `Mealie import of "${summary?.slug}" failed:`,
          (error as Error).message
        )
      }
    }

    try {
      for (let page = 1; page <= totalPages; page++) {
        const items: any[] =
          page === 1 ? first.items : (await mealie.page(page)).items
        if (!Array.isArray(items) || !items.length) break
        const done = await importedIds(
          db,
          householdId,
          items.map((item) => String(item.id))
        )
        const todo = items.filter((item) => !done.has(String(item.id)))
        skipped += items.length - todo.length
        for (let i = 0; i < todo.length; i += CONCURRENCY) {
          await Promise.all(todo.slice(i, i + CONCURRENCY).map(importOne))
          await save()
        }
        await save()
      }
    } catch (error) {
      status = "failed"
      console.error("Mealie import stopped:", (error as Error).message)
    }
    await db
      .update(aiJobs)
      .set({ status, done: imported, skipped, failed, finishedAt: new Date() })
      .where(eq(aiJobs.id, job.id))
  })()

  return toJob(job)
}
