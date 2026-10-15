import {
  NUTRIENT_KEYS,
  type CleanupJob,
  type NutritionLibrary,
  type NutrientValues,
  type Nutrition,
  type Recipe,
} from "@mise/shared"
import { and, asc, desc, eq, exists, inArray, isNull } from "drizzle-orm"
import { z } from "zod"

import type { AiActor, AiService } from "../ai/service.ts"
import type { Db } from "../db/client.ts"
import {
  aiJobs,
  fdcFoods,
  foodMatches,
  recipeIngredients,
  recipes,
} from "../db/schema.ts"
import { HttpError } from "../http.ts"
import {
  createFdcClient,
  FdcRateLimitError,
  type FdcCandidate,
  type FdcClient,
  type FdcClientFactory,
  type FdcFood,
} from "../nutrition/fdc.ts"
import { gramsFor, readAmount, type Amount } from "../nutrition/grams.ts"
import { usdaKey } from "../nutrition/settings.ts"
import { getRecipe, notDeleted, setRecipeFields } from "./recipes.ts"

export type NutritionService = ReturnType<typeof createNutritionService>

/** More than this share of lines not counted, and an estimate does better. */
const TOO_MANY_MISSING = 1 / 3

const pickSchema = z.object({
  lines: z.array(
    z.object({
      line: z.number().int(),
      fdcId: z.number().int().nullable(),
      grams: z.number().nullable(),
    })
  ),
})

const PICK_SYSTEM = `You match recipe ingredient lines to USDA FoodData Central foods and weigh them.

For each numbered line:
- fdcId: pick the candidate that is this ingredient as used in the recipe: raw unless the line says cooked, canned, dried or frozen; plain and generic over specific products. Use null if no candidate is the same food (a different food, or a dish made from it). For a line marked "already matched", repeat its id.
- grams: the weight in grams of the amount in the line, as used (the edible part: no bones, pits or peel). Use typical sizes ("1 onion" is about 110 g, "1 chicken thigh" about 120 g, "1 lemon, juiced" about 45 g of juice). Use null if the line has no amount at all.

Answer for every line, by its number.`

const amount = z.number().nullable()
const estimateSchema = z.object({
  calories: amount,
  fat: amount,
  saturatedFat: amount,
  carbohydrates: amount,
  fiber: amount,
  sugar: amount,
  protein: amount,
  sodium: amount,
  cholesterol: amount,
}) satisfies z.ZodType<NutrientValues>

const ESTIMATE_SYSTEM = `You estimate nutrition for home recipes. Given the ingredients and how many servings the recipe makes, estimate one serving: calories (kcal), fat, saturatedFat, carbohydrates, fiber, sugar and protein in grams, and sodium and cholesterol in milligrams. Count only what's eaten (not marinade poured off or frying oil left in the pan). Use null for anything you can't reasonably estimate.`

function round(key: string, value: number) {
  return key === "calories" || key === "sodium" || key === "cholesterol"
    ? Math.round(value)
    : Math.round(value * 10) / 10
}

/** Words that make a USDA food something else, unless the line says them too. */
const OTHER_THING =
  /\b(skin|breaded|frozen|dried|dehydrated|powder|flakes|rings|mix|canned|cooked|fried|roasted|baked|braised|stewed|reheated)\b/g

/**
 * A plain match when there's no AI. Each candidate scores for starting with
 * the food's first or main word and for having its words, loses points for
 * words that make it a different thing ("skin", "dehydrated") and for being
 * a long, specific entry. Brands are skipped. Null when nothing scores.
 */
export function guessCandidate(name: string, candidates: FdcCandidate[]) {
  const words = name
    .toLowerCase()
    .split(/\s+/)
    .map((w) => w.replace(/(es|s)$/, ""))
    .filter((w) => w.length > 2)
  if (!words.length) return null
  const asked = new Set(name.toLowerCase().match(OTHER_THING) ?? [])
  let best: { candidate: FdcCandidate; score: number } | null = null
  for (const candidate of candidates) {
    // "DENNY'S, onion rings": a restaurant or brand.
    if (/\b[A-Z]{3,}/.test(candidate.description.replace(/'S\b/, ""))) continue
    const text = candidate.description.toLowerCase()
    const segments = text.split(",").map((s) => s.trim())
    let score = 0
    if ([words[0]!, words.at(-1)!].some((w) => segments[0]!.startsWith(w))) {
      score += 2
    }
    score += words.filter((w) => text.includes(w)).length
    score -=
      2 * (text.match(OTHER_THING) ?? []).filter((w) => !asked.has(w)).length
    if (!asked.size && /\braw\b/.test(text)) score += 1
    score -= 0.5 * Math.max(0, segments.length - 2)
    if (score >= 2 && (!best || score > best.score)) best = { candidate, score }
  }
  return best?.candidate ?? null
}

export function createNutritionService(
  db: Db,
  ai: AiService,
  options: {
    fdcFactory?: FdcClientFactory
    auto?: boolean
    /** How long to wait after USDA's hourly limit before trying again. */
    rateLimitWaitMs?: number
  } = {}
) {
  const factory = options.fdcFactory ?? ((key: string) => createFdcClient(key))
  /** One run at a time per recipe; a save during a run queues another. */
  const queue = new Map<string, Promise<unknown>>()

  async function client(): Promise<FdcClient | null> {
    const found = await usdaKey(db)
    return found ? factory(found.key) : null
  }

  /** What it can do: calculate (USDA key) and estimate (AI key). */
  async function abilities() {
    const status = await ai.status()
    return { calculate: status.usda, estimate: status.available }
  }

  /** Cached USDA foods, fetching any we don't have yet. */
  async function foodsById(fdc: FdcClient, ids: number[]) {
    const wanted = [...new Set(ids)]
    const found = new Map<number, FdcFood>()
    if (!wanted.length) return found
    const rows = await db
      .select()
      .from(fdcFoods)
      .where(inArray(fdcFoods.fdcId, wanted))
    for (const row of rows) found.set(row.fdcId, row)
    for (const id of wanted) {
      if (found.has(id)) continue
      const food = await fdc.food(id)
      if (!food) continue
      await db.insert(fdcFoods).values(food).onConflictDoNothing()
      found.set(id, food)
    }
    return found
  }

  async function saveMatch(
    food: string,
    fdcId: number | null,
    grams: Record<string, number>
  ) {
    await db
      .insert(foodMatches)
      .values({ food, fdcId, grams })
      .onConflictDoUpdate({ target: foodMatches.food, set: { fdcId, grams } })
  }

  /**
   * Adds up the ingredients with USDA data. Each food is matched once and
   * cached for every recipe after; amounts are weighed from the line or the
   * food's portions, with the AI (when there is one) picking matches and
   * weighing what portions can't.
   */
  async function calculate(
    actor: AiActor,
    recipe: Recipe,
    amounts: Amount[],
    fdc: FdcClient,
    useAi: boolean
  ) {
    const keys = [...new Set(amounts.map((a) => a.key))]
    const cached = await db
      .select()
      .from(foodMatches)
      .where(inArray(foodMatches.food, keys))
    const matches = new Map(cached.map((m) => [m.food, m]))
    const foods = await foodsById(
      fdc,
      cached.flatMap((m) => (m.fdcId ? [m.fdcId] : []))
    )

    const candidates = new Map<string, FdcCandidate[]>()
    for (const amount of amounts) {
      if (matches.has(amount.key) || candidates.has(amount.key)) continue
      candidates.set(amount.key, await fdc.search(amount.name))
    }

    const grams: (number | null)[] = amounts.map((amount) => {
      const match = matches.get(amount.key)
      const food = match?.fdcId ? foods.get(match.fdcId) : undefined
      return food ? gramsFor(amount, food.portions, match!.grams) : null
    })

    // Lines that need a match, or a weight the portions can't give.
    const ask = amounts.flatMap((amount, i) => {
      const match = matches.get(amount.key)
      if (match && (match.fdcId === null || grams[i] !== null)) return []
      return [i]
    })

    if (ask.length) {
      const picks = new Map<
        number,
        { fdcId: number | null; grams: number | null }
      >()
      if (useAi) {
        const listed = ask.map((i, n) => {
          const amount = amounts[i]!
          const match = matches.get(amount.key)
          const options = match?.fdcId
            ? `already matched: ${match.fdcId} ${foods.get(match.fdcId)?.description ?? ""}`
            : (candidates.get(amount.key) ?? [])
                .map((c) => `${c.fdcId} ${c.description}`)
                .join(" | ") || "no candidates"
          return `${n + 1}. ${amount.text}\n   ${options}`
        })
        const result = await ai.extract("nutrition", actor, {
          system: PICK_SYSTEM,
          parts: [{ type: "text", text: listed.join("\n") }],
          schema: pickSchema,
          schemaName: "ingredient_matches",
        })
        for (const pick of result.lines) {
          const i = ask[pick.line - 1]
          if (i !== undefined) picks.set(i, pick)
        }
      } else {
        for (const i of ask) {
          const amount = amounts[i]!
          if (matches.has(amount.key)) continue
          const guess = guessCandidate(
            amount.name,
            candidates.get(amount.key) ?? []
          )
          picks.set(i, { fdcId: guess?.fdcId ?? null, grams: null })
        }
      }

      // Save new matches (only ids that were offered), then weigh again.
      for (const i of ask) {
        const amount = amounts[i]!
        if (matches.has(amount.key)) continue
        const offered = candidates.get(amount.key) ?? []
        const fdcId = picks.get(i)?.fdcId ?? null
        const valid = offered.some((c) => c.fdcId === fdcId) ? fdcId : null
        const row = { food: amount.key, fdcId: valid, grams: {} }
        await saveMatch(row.food, row.fdcId, row.grams)
        matches.set(amount.key, { ...row, updatedAt: new Date() })
      }
      const more = await foodsById(
        fdc,
        ask.flatMap((i) => {
          const id = matches.get(amounts[i]!.key)?.fdcId
          return id && !foods.has(id) ? [id] : []
        })
      )
      for (const [id, food] of more) foods.set(id, food)

      for (const i of ask) {
        const amount = amounts[i]!
        const match = matches.get(amount.key)!
        const food = match.fdcId ? foods.get(match.fdcId) : undefined
        if (!food) continue
        const weighed = gramsFor(amount, food.portions, match.grams)
        const guessed = picks.get(i)?.grams ?? null
        grams[i] = weighed ?? (guessed && guessed > 0 ? guessed : null)
        // Remember what one of the unit weighs, for next time.
        if (weighed === null && grams[i] && amount.quantity) {
          match.grams = {
            ...match.grams,
            [amount.unit?.id ?? "each"]: grams[i]! / amount.quantity,
          }
          await saveMatch(match.food, match.fdcId, match.grams)
        }
      }
    }

    const totals = Object.fromEntries(
      NUTRIENT_KEYS.map((key) => [key, null])
    ) as Record<string, number | null>
    const notCounted: string[] = []
    amounts.forEach((amount, i) => {
      const match = matches.get(amount.key)
      const food = match?.fdcId ? foods.get(match.fdcId) : undefined
      if (!food || grams[i] === null) {
        notCounted.push(amount.text)
        return
      }
      for (const key of NUTRIENT_KEYS) {
        const per100 = food.nutrients[key]
        if (per100 === null) continue
        totals[key] = (totals[key] ?? 0) + (per100 * grams[i]!) / 100
      }
    })

    const servings = recipe.servings!
    const nutrition = Object.fromEntries(
      NUTRIENT_KEYS.map((key) => [
        key,
        totals[key] === null ? null : round(key, totals[key]! / servings),
      ])
    ) as NutrientValues
    return {
      nutrition: {
        ...nutrition,
        source: "calculated",
        notCounted,
      } as Nutrition,
      poor: notCounted.length > amounts.length * TOO_MANY_MISSING,
    }
  }

  async function estimate(actor: AiActor, recipe: Recipe): Promise<Nutrition> {
    const values = await ai.extract("nutrition", actor, {
      system: ESTIMATE_SYSTEM,
      parts: [
        {
          type: "text",
          text: `${recipe.name}\nMakes ${recipe.servings} servings.\n\nIngredients:\n${recipe.ingredients.map((i) => i.text).join("\n")}`,
        },
      ],
      schema: estimateSchema,
      schemaName: "nutrition_estimate",
    })
    const nutrition = Object.fromEntries(
      NUTRIENT_KEYS.map((key) => {
        const value = values[key]
        return [key, value === null || value < 0 ? null : round(key, value)]
      })
    ) as NutrientValues
    return { ...nutrition, source: "estimate" }
  }

  /**
   * Nutrition per serving: calculated from USDA data when there's a key, an
   * AI estimate when there isn't (or too much couldn't be counted).
   */
  async function compute(actor: AiActor, recipe: Recipe): Promise<Nutrition> {
    if (!recipe.servings) {
      throw new HttpError(400, "Add how many servings it makes first")
    }
    const amounts = recipe.ingredients.flatMap((i) => readAmount(i.text) ?? [])
    if (!amounts.length) {
      throw new HttpError(400, "There are no ingredients to work it out from")
    }
    const can = await abilities()
    if (!can.calculate && !can.estimate) {
      throw new HttpError(
        400,
        "Nutrition needs a USDA key or an AI key. The server admin can add one in Settings."
      )
    }
    if (!can.calculate) return estimate(actor, recipe)
    const fdc = (await client())!
    const result = await calculate(actor, recipe, amounts, fdc, can.estimate)
    return result.poor && can.estimate
      ? estimate(actor, recipe)
      : result.nutrition
  }

  /** Runs one recipe at a time; a second request waits for the first. */
  function queued<T>(id: string, run: () => Promise<T>): Promise<T> {
    const before = queue.get(id) ?? Promise.resolve()
    const next = before.catch(() => {}).then(run)
    queue.set(id, next)
    void next
      .catch(() => {})
      .finally(() => {
        if (queue.get(id) === next) queue.delete(id)
      })
    return next
  }

  /** Works out a recipe's nutrition and saves it. */
  function workOut(actor: AiActor & { householdId: string }, idOrSlug: string) {
    return getRecipe(db, actor.householdId, idOrSlug).then((recipe) =>
      queued(recipe.id, async () => {
        const fresh = await getRecipe(db, actor.householdId, recipe.id)
        const nutrition = await compute(actor, fresh)
        return setRecipeFields(db, actor.householdId, recipe.id, { nutrition })
      })
    )
  }

  /**
   * After a recipe is saved: work out nutrition in the background when it
   * has none or its ingredients changed. A change of servings alone scales
   * what's there.
   */
  function afterSave(
    actor: AiActor & { householdId: string },
    recipe: Recipe,
    previous: Recipe | null = null
  ) {
    if (options.auto === false) return
    const sameIngredients =
      previous !== null &&
      JSON.stringify(previous.ingredients.map((i) => i.text)) ===
        JSON.stringify(recipe.ingredients.map((i) => i.text))
    void (async () => {
      if (recipe.nutrition && (!previous || sameIngredients)) {
        if (
          previous?.servings &&
          recipe.servings &&
          previous.servings !== recipe.servings
        ) {
          const factor = previous.servings / recipe.servings
          const scaled = { ...recipe.nutrition }
          for (const key of NUTRIENT_KEYS) {
            const value = scaled[key]
            if (value !== null) scaled[key] = round(key, value * factor)
          }
          await setRecipeFields(db, actor.householdId, recipe.id, {
            nutrition: scaled,
          })
        }
        return
      }
      if (!recipe.servings || !recipe.ingredients.length) return
      const can = await abilities()
      if (!can.calculate && !can.estimate) return
      await workOut(actor, recipe.id)
    })().catch((error) =>
      console.error(`Couldn't work out nutrition for ${recipe.name}:`, error)
    )
  }

  // ---- The whole library ----

  /** Library runs going in this process, so they can be stopped. */
  const runs = new Map<string, { cancelled: boolean }>()
  const waitMs = options.rateLimitWaitMs ?? 5 * 60_000

  /** Recipes with no nutrition yet, oldest first, and how many lack servings. */
  async function missing(householdId: string) {
    const rows = await db
      .select({ id: recipes.id, servings: recipes.servings })
      .from(recipes)
      .where(
        and(
          eq(recipes.householdId, householdId),
          notDeleted,
          isNull(recipes.nutrition),
          exists(
            db
              .select({ id: recipeIngredients.id })
              .from(recipeIngredients)
              .where(eq(recipeIngredients.recipeId, recipes.id))
          )
        )
      )
      .orderBy(asc(recipes.createdAt))
    return {
      ids: rows.filter((r) => r.servings).map((r) => r.id),
      noServings: rows.filter((r) => !r.servings).length,
    }
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

  async function libraryStatus(householdId: string): Promise<NutritionLibrary> {
    const [row] = await db
      .select()
      .from(aiJobs)
      .where(
        and(eq(aiJobs.kind, "nutrition"), eq(aiJobs.householdId, householdId))
      )
      .orderBy(desc(aiJobs.createdAt))
      .limit(1)
    const { ids, noServings } = await missing(householdId)
    return { job: row ? toJob(row) : null, missing: ids.length, noServings }
  }

  /**
   * Works out nutrition for every recipe that has none, in the background,
   * two at a time. Hitting USDA's hourly limit pauses the run rather than
   * ending it.
   */
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
          eq(aiJobs.kind, "nutrition"),
          eq(aiJobs.householdId, householdId),
          eq(aiJobs.status, "running")
        )
      )
    if (active)
      throw new HttpError(409, "Nutrition is already being worked out")
    const can = await abilities()
    if (!can.calculate && !can.estimate) {
      throw new HttpError(400, "Nutrition needs a USDA key or an AI key")
    }
    const { ids } = await missing(householdId)
    if (!ids.length) {
      throw new HttpError(400, "Every recipe with servings has nutrition")
    }
    const [row] = await db
      .insert(aiJobs)
      .values({
        householdId,
        kind: "nutrition",
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
          for (let wait = 0; ; wait++) {
            try {
              await workOut(actor, id)
              done++
              failuresInARow = 0
            } catch (error) {
              if (error instanceof FdcRateLimitError && wait < 12) {
                await new Promise((resolve) => setTimeout(resolve, waitMs))
                if (!control.cancelled) continue
              }
              failed++
              failuresInARow++
              console.warn(
                `Nutrition for recipe ${id} failed:`,
                (error as Error).message
              )
              if (failuresInARow >= 3) {
                status = "failed"
                control.cancelled = true
              }
            }
            break
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
        console.error("Library nutrition run stopped:", error)
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
    abilities,
    workOut,
    afterSave,
    compute,
    libraryStatus,
    startLibraryRun,
    stopLibraryRun,
  }
}
