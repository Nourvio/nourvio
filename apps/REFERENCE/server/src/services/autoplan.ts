import {
  addDays,
  autoPlanDue,
  autoPlanTarget,
  weekAhead,
  type AutoPlan,
  type AutoPlanRun,
  type Meal,
} from "@mise/shared"
import { sql } from "drizzle-orm"

import type { Db } from "../db/client.ts"
import { households } from "../db/schema.ts"
import { getHousehold, updateHousehold } from "./households.ts"
import { addFromPlan } from "./list.ts"
import { addEntry, listEntries } from "./plan.ts"
import { suggestMeals } from "./suggest.ts"

/**
 * Fills a week's empty meals, from `from` to `to`, the way Fill the week
 * does (the household's meals, rules and tastes), then adds them to the
 * shopping list if asked.
 */
export async function planWeek(
  db: Db,
  householdId: string,
  range: { week: string; from: string; to: string },
  addToList: boolean
): Promise<AutoPlanRun> {
  const household = await getHousehold(db, householdId)
  const taken = new Set(
    (await listEntries(db, householdId, range.from, range.to)).map(
      (entry) => `${entry.date} ${entry.meal}`
    )
  )
  const slots: { date: string; meal: Meal }[] = []
  for (let date = range.from; date <= range.to; date = addDays(date, 1)) {
    for (const meal of household.meals) {
      if (!taken.has(`${date} ${meal}`)) slots.push({ date, meal })
    }
  }
  const suggestions = await suggestMeals(db, householdId, slots)
  for (const suggestion of suggestions) {
    await addEntry(
      db,
      householdId,
      {
        date: suggestion.date,
        meal: suggestion.meal,
        recipeId: suggestion.recipe.id,
        withRecipeId: suggestion.with?.id ?? null,
      },
      null
    )
  }
  const list = addToList
    ? await addFromPlan(db, householdId, range.week, range.to)
    : null
  return {
    week: range.week,
    at: new Date().toISOString(),
    planned: suggestions.length,
    empty: slots.length,
    listed: list ? list.added + list.merged : 0,
  }
}

/** Plans the week ahead right now ("Plan the week ahead now" in Settings). */
export async function planWeekAheadNow(db: Db, householdId: string) {
  const household = await getHousehold(db, householdId)
  const range = weekAhead(
    household.weekStart,
    household.autoPlan.timeZone,
    new Date()
  )
  const run = await planWeek(
    db,
    householdId,
    range,
    household.autoPlan.addToList
  )
  await updateHousehold(db, householdId, {
    autoPlan: { ...household.autoPlan, handledWeek: range.week, last: run },
  })
  return run
}

/**
 * Saves the schedule. Turning it on counts the current week as handled, so
 * it waits for the next scheduled time rather than running for one that
 * has already passed.
 */
export async function saveAutoPlan(
  db: Db,
  householdId: string,
  input: Pick<AutoPlan, "enabled" | "day" | "hour" | "addToList" | "timeZone">
) {
  const household = await getHousehold(db, householdId)
  const current = household.autoPlan
  const turningOn = input.enabled && !current.enabled
  const next: AutoPlan = {
    ...current,
    ...input,
    handledWeek: turningOn
      ? autoPlanTarget(input, household.weekStart, new Date()).start
      : current.handledWeek,
  }
  return updateHousehold(db, householdId, { autoPlan: next })
}

/** Before a household's week is planned, such as checking this week's sales. */
export type BeforePlan = (householdId: string) => Promise<unknown>

/** Runs every household's plan that's due. Safe to call often. */
export async function runDueAutoPlans(
  db: Db,
  now = new Date(),
  beforePlan?: BeforePlan
) {
  const rows = await db
    .select({ id: households.id })
    .from(households)
    .where(sql`${households.settings} -> 'autoPlan' ->> 'enabled' = 'true'`)
  for (const { id } of rows) {
    try {
      const household = await getHousehold(db, id)
      const due = autoPlanDue(household.autoPlan, household.weekStart, now)
      if (!due) continue
      // Marked handled first, so a slow or failing run isn't repeated.
      await updateHousehold(db, id, {
        autoPlan: { ...household.autoPlan, handledWeek: due.week },
      })
      // Planned without fresh prices rather than not at all.
      await beforePlan?.(id).catch((error) =>
        console.error(`Before planning for household ${id}:`, error)
      )
      const run = await planWeek(db, id, due, household.autoPlan.addToList)
      const latest = await getHousehold(db, id)
      await updateHousehold(db, id, {
        autoPlan: { ...latest.autoPlan, last: run },
      })
      console.log(
        `Planned the week of ${due.week} for household ${id}: ${run.planned} of ${run.empty} meals, ${run.listed} on the list`
      )
    } catch (error) {
      console.error(`Autoplan for household ${id} failed:`, error)
    }
  }
}

/** Checks for due plans every few minutes while the server runs. */
export function startAutoPlanScheduler(
  db: Db,
  options: { everyMs?: number; beforePlan?: BeforePlan } = {}
) {
  const everyMs = options.everyMs ?? 5 * 60_000
  const check = () => {
    void runDueAutoPlans(db, new Date(), options.beforePlan).catch((error) =>
      console.error("Autoplan check failed:", error)
    )
  }
  setTimeout(check, 30_000).unref()
  setInterval(check, everyMs).unref()
}
