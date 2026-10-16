import {
  addDays,
  clockIn,
  daysBetween,
  isDay,
  MEALS,
  mealOfTheHour,
  nextMeal,
  plannedMeals,
  weekStartOf,
  type Meal,
} from "@merran/shared"
import type { EntityManager } from "@mikro-orm/sql"
import { AppError } from "../../core/errors.ts"
import {
  Household,
  PlanEntry,
  Recipe,
  type PLAN_STATUSES,
} from "../../database/entities/index.ts"
import { HOUSEHOLD_FILTER, NOT_DELETED_FILTER } from "../../database/scope.ts"
import { photoUrls } from "../recipes/photos.ts"
import {
  inHouseholdTransaction,
  toNumber,
  totalMinutes,
} from "../recipes/recipes.ts"

// The week plan: meals on days, and the week's pool of meals for any day.
// "Today" is always the household's, in its own time zone.

export type PlanStatus = (typeof PLAN_STATUSES)[number]

/** The most days the plan is read for at once. */
const MAX_DAYS = 62
/** How far ahead what's next looks. */
const NEXT_DAYS = 14

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Deleted recipes are loaded too, so their meals can be left out. */
const WITH_DELETED = { filters: { [NOT_DELETED_FILTER]: false } }
const POPULATE = ["recipe", "withRecipe"] as const

/** The household's day and hour, the day its week starts, and the meals it plans. */
export async function householdClock(em: EntityManager, householdId: string) {
  const household = await em.findOneOrFail(Household, { id: householdId })
  return {
    ...clockIn(household.timeZone),
    weekStartsOn: household.weekStartsOn,
    meals: plannedMeals(household.settings?.meals),
  }
}

/** A recipe that's in Recently deleted takes its meals off the plan until it's back. */
const shown = (entry: PlanEntry) => {
  const recipe = entry.recipe?.getEntity()
  return !recipe?.deletedAt
}

function recipeSummary(recipe: Recipe | undefined | null) {
  if (!recipe || recipe.deletedAt) return null
  return {
    id: recipe.id,
    slug: recipe.slug,
    name: recipe.name,
    photo: photoUrls(recipe)?.card ?? null,
    servings: toNumber(recipe.servings),
    totalMinutes: totalMinutes(recipe),
  }
}

/** A meal on the plan as the API shows it. Its recipes are loaded. */
export function describeEntry(entry: PlanEntry) {
  const withRecipe = entry.withRecipe?.getEntity()
  return {
    id: entry.id,
    date: entry.date,
    anyDay: entry.anyDay,
    meal: entry.meal,
    position: entry.position,
    status: entry.status,
    recipe: recipeSummary(entry.recipe?.getEntity()),
    withRecipe:
      withRecipe && !withRecipe.deletedAt
        ? { id: withRecipe.id, slug: withRecipe.slug, name: withRecipe.name }
        : null,
    note: entry.note ?? null,
    servings: toNumber(entry.servings),
    createdAt: entry.createdAt.toISOString(),
  }
}

export type DescribedEntry = ReturnType<typeof describeEntry>

/** A meal as it was, to put it back as it was (Undo). */
export function snapshotOf(entry: PlanEntry) {
  return {
    id: entry.id,
    date: entry.date,
    anyDay: entry.anyDay,
    meal: entry.meal,
    position: entry.position,
    status: entry.status,
    recipe: entry.recipe?.id ?? null,
    withRecipe: entry.withRecipe?.id ?? null,
    note: entry.note ?? null,
    servings: toNumber(entry.servings),
    listedAt: entry.listedAt?.toISOString() ?? null,
  }
}

export type EntrySnapshot = ReturnType<typeof snapshotOf>

/** Meals in the order a day has them. */
export function sortEntries<
  T extends Pick<PlanEntry, "date" | "meal" | "position" | "anyDay">,
>(entries: T[]) {
  return [...entries].sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      Number(b.anyDay) - Number(a.anyDay) ||
      MEALS.indexOf(a.meal) - MEALS.indexOf(b.meal) ||
      a.position - b.position
  )
}

function checkDay(value: string, field: string) {
  if (!isDay(value)) {
    throw new AppError("invalid", "bad_day", "That isn't a day.", {
      [field]: 'Use a day written like "2026-10-15".',
    })
  }
}

/** The plan from one day to another, the week's pool included. */
export async function listPlan(
  em: EntityManager,
  { from, to }: { from: string; to: string }
) {
  checkDay(from, "from")
  checkDay(to, "to")
  const span = daysBetween(from, to)
  if (span < 0 || span > MAX_DAYS) {
    throw new AppError(
      "invalid",
      "bad_range",
      `Ask for up to ${MAX_DAYS} days at a time, from the first to the last.`
    )
  }
  const entries = await em.find(
    PlanEntry,
    { date: { $gte: from, $lte: to } },
    { populate: POPULATE, ...WITH_DELETED }
  )
  return sortEntries(entries.filter(shown)).map(describeEntry)
}

async function findEntry(em: EntityManager, entryId: string) {
  const entry = UUID.test(entryId)
    ? await em.findOne(
        PlanEntry,
        { id: entryId },
        { populate: POPULATE, ...WITH_DELETED }
      )
    : null
  if (!entry || !shown(entry)) {
    throw new AppError(
      "not_found",
      "plan_entry_not_found",
      "That meal isn't on the plan."
    )
  }
  return entry
}

/** One of the household's recipes, by id or address. */
async function recipeFor(em: EntityManager, idOrSlug: string, field: string) {
  const recipe = await em.findOne(
    Recipe,
    UUID.test(idOrSlug) ? { id: idOrSlug } : { slug: idOrSlug }
  )
  if (!recipe) {
    throw new AppError(
      "not_found",
      "recipe_not_found",
      "There's no such recipe.",
      {
        [field]: "There's no such recipe.",
      }
    )
  }
  return recipe
}

/** After the last meal in a slot: a day's meal, or the week's pool. */
async function nextPosition(
  em: EntityManager,
  slot: { date: string; meal: Meal; anyDay: boolean }
) {
  const last = await em.findOne(PlanEntry, slot, {
    orderBy: { position: "desc" },
  })
  return last ? last.position + 1 : 0
}

/** Cooked now: the recipe and its side were made now. */
function setStatus(entry: PlanEntry, status: PlanStatus) {
  if (status === entry.status) return
  if (status === "cooked") {
    const now = new Date()
    const recipe = entry.recipe?.getEntity()
    const side = entry.withRecipe?.getEntity()
    if (recipe) recipe.lastMadeAt = now
    if (side) side.lastMadeAt = now
  }
  entry.status = status
}

/** A meal must be a recipe or a note, and a side goes with a recipe. */
function checkShape(entry: PlanEntry) {
  if (!entry.recipe === !entry.note) {
    throw new AppError(
      "invalid",
      "recipe_or_note",
      "A meal is a recipe or a note, not both or neither."
    )
  }
  if (entry.withRecipe && !entry.recipe) {
    throw new AppError(
      "invalid",
      "side_needs_recipe",
      "A side goes with a recipe, not a note."
    )
  }
}

export type NewEntry = {
  date: string
  meal: Meal
  /** For the week's pool: any day of the week the date is in. */
  anyDay?: boolean
  recipe?: string | null
  withRecipe?: string | null
  note?: string | null
  servings?: number | null
}

/** Puts a meal on the plan, after any already in its slot. */
export async function addEntry(
  em: EntityManager,
  householdId: string,
  input: NewEntry
) {
  checkDay(input.date, "date")
  const anyDay = input.anyDay ?? false
  const date = anyDay
    ? weekStartOf(
        input.date,
        (await householdClock(em, householdId)).weekStartsOn
      )
    : input.date
  const recipe = input.recipe
    ? await recipeFor(em, input.recipe, "recipe")
    : null
  const withRecipe = input.withRecipe
    ? await recipeFor(em, input.withRecipe, "withRecipe")
    : null
  const entry = em.create(PlanEntry, {
    household: householdId,
    date,
    anyDay,
    meal: input.meal,
    position: await nextPosition(em, { date, meal: input.meal, anyDay }),
    recipe,
    withRecipe,
    note: input.note?.trim() || null,
    servings: input.servings ?? null,
    status: "planned",
  })
  checkShape(entry)
  await em.flush()
  return describeEntry(entry)
}

export type EntryChanges = Partial<{
  date: string
  meal: Meal
  anyDay: boolean
  recipe: string | null
  withRecipe: string | null
  note: string | null
  servings: number | null
  status: PlanStatus
}>

/** Moves, swaps or changes a meal. Moving it puts it after any in its new slot. */
async function change(
  em: EntityManager,
  householdId: string,
  entry: PlanEntry,
  changes: EntryChanges
) {
  const date = changes.date ?? entry.date
  if (changes.date !== undefined) checkDay(changes.date, "date")
  const anyDay = changes.anyDay ?? entry.anyDay
  const meal = changes.meal ?? entry.meal
  const slotDate = anyDay
    ? weekStartOf(date, (await householdClock(em, householdId)).weekStartsOn)
    : date
  if (
    slotDate !== entry.date ||
    anyDay !== entry.anyDay ||
    meal !== entry.meal
  ) {
    entry.position = await nextPosition(em, { date: slotDate, meal, anyDay })
    entry.date = slotDate
    entry.anyDay = anyDay
    entry.meal = meal
  }

  if (changes.recipe !== undefined) {
    const recipe = changes.recipe
      ? await recipeFor(em, changes.recipe, "recipe")
      : null
    if (recipe && recipe.id !== entry.recipe?.id) {
      // Something else: a new meal to shop for and cook, its side kept.
      entry.recipe = em.getReference(Recipe, recipe.id, { wrapped: true })
      entry.note = null
      entry.listedAt = null
      entry.status = "planned"
    } else if (!recipe) {
      entry.recipe = null
      entry.withRecipe = null
    }
  }
  if (changes.note !== undefined) {
    entry.note = changes.note?.trim() || null
    if (entry.note) {
      entry.recipe = null
      entry.withRecipe = null
    }
  }
  if (changes.withRecipe !== undefined) {
    entry.withRecipe = changes.withRecipe
      ? em.getReference(
          Recipe,
          (await recipeFor(em, changes.withRecipe, "withRecipe")).id,
          { wrapped: true }
        )
      : null
  }
  if (changes.servings !== undefined) entry.servings = changes.servings
  if (changes.status !== undefined) setStatus(entry, changes.status)
  checkShape(entry)
}

export async function updateEntry(
  em: EntityManager,
  householdId: string,
  entryId: string,
  changes: EntryChanges
) {
  const entry = await findEntry(em, entryId)
  await change(em, householdId, entry, changes)
  await em.flush()
  return describeEntry(await findEntry(em.fork(), entry.id))
}

/** Takes a meal off the plan; says what it was, to put it back. */
export async function removeEntry(em: EntityManager, entryId: string) {
  const entry = await findEntry(em, entryId)
  const before = snapshotOf(entry)
  em.remove(entry)
  await em.flush()
  return before
}

export type BulkAction =
  | { action: "remove" }
  | { action: "move"; date: string; meal?: Meal; anyDay?: boolean }
  | { action: "status"; status: PlanStatus }

/**
 * Several meals at once, all or nothing. Says what they were before, so
 * Undo can put them back as they were.
 */
export async function bulkPlan(
  em: EntityManager,
  householdId: string,
  ids: readonly string[],
  action: BulkAction
) {
  return inHouseholdTransaction(em, householdId, async (tx) => {
    const found = await tx.find(
      PlanEntry,
      { id: { $in: ids.filter((id) => UUID.test(id)) } },
      { populate: POPULATE, ...WITH_DELETED }
    )
    const entries = sortEntries(found.filter(shown))
    const before = entries.map(snapshotOf)
    for (const entry of entries) {
      if (action.action === "remove") tx.remove(entry)
      else if (action.action === "move") {
        await change(tx, householdId, entry, {
          date: action.date,
          ...(action.meal ? { meal: action.meal } : {}),
          anyDay: action.anyDay ?? false,
        })
        // Each after the one moved before it.
        await tx.flush()
      } else await change(tx, householdId, entry, { status: action.status })
    }
    await tx.flush()
    return {
      entries:
        action.action === "remove"
          ? []
          : entries.map((entry) => describeEntry(entry)),
      before,
    }
  })
}

/**
 * Puts meals back as they were: ones taken off come back with the same id,
 * ones changed go back to how they were.
 */
export async function restoreEntries(
  em: EntityManager,
  householdId: string,
  snapshots: readonly EntrySnapshot[]
) {
  return inHouseholdTransaction(em, householdId, async (tx) => {
    const recipeIds = [
      ...new Set(
        snapshots.flatMap((snapshot) =>
          [snapshot.recipe, snapshot.withRecipe].filter(
            (id): id is string => id !== null
          )
        )
      ),
    ]
    const recipes = new Map(
      (await tx.find(Recipe, { id: { $in: recipeIds } }, WITH_DELETED)).map(
        (recipe) => [recipe.id, recipe]
      )
    )
    const restored: PlanEntry[] = []
    for (const snapshot of snapshots) {
      if (!UUID.test(snapshot.id) || !isDay(snapshot.date)) continue
      const recipe = snapshot.recipe ? recipes.get(snapshot.recipe) : null
      if (snapshot.recipe && !recipe) continue
      let entry = await tx.findOne(PlanEntry, { id: snapshot.id })
      if (!entry) {
        // An id another household has can't come back here.
        const elsewhere = await tx.count(
          PlanEntry,
          { id: snapshot.id },
          { filters: { [HOUSEHOLD_FILTER]: false } }
        )
        if (elsewhere > 0) continue
        entry = tx.create(PlanEntry, {
          id: snapshot.id,
          household: householdId,
          date: snapshot.date,
          meal: snapshot.meal,
        })
      }
      tx.assign(entry, {
        date: snapshot.date,
        anyDay: snapshot.anyDay,
        meal: snapshot.meal,
        position: snapshot.position,
        status: snapshot.status,
        recipe: recipe ?? null,
        withRecipe: snapshot.withRecipe
          ? (recipes.get(snapshot.withRecipe) ?? null)
          : null,
        note: snapshot.note,
        servings: snapshot.servings,
        listedAt: snapshot.listedAt ? new Date(snapshot.listedAt) : null,
      })
      restored.push(entry)
    }
    await tx.flush()
    return sortEntries(restored).map(describeEntry)
  })
}

/**
 * Last week's meals, again: each on the same weekday and meal where that
 * slot is still empty, and the pool's into the pool. Skipped ones stay
 * behind. Copies start as planned.
 */
export async function repeatLastWeek(
  em: EntityManager,
  householdId: string,
  weekStart: string
) {
  checkDay(weekStart, "week")
  const last = addDays(weekStart, -7)
  return inHouseholdTransaction(em, householdId, async (tx) => {
    const [before, now] = await Promise.all([
      tx.find(
        PlanEntry,
        { date: { $gte: last, $lte: addDays(last, 6) } },
        { populate: POPULATE, ...WITH_DELETED }
      ),
      tx.find(PlanEntry, {
        date: { $gte: weekStart, $lte: addDays(weekStart, 6) },
      }),
    ])
    const taken = new Set(
      now
        .filter((entry) => !entry.anyDay)
        .map((entry) => `${entry.date} ${entry.meal}`)
    )
    const inPool = new Set(
      now
        .filter((entry) => entry.anyDay)
        .map((entry) => entry.recipe?.id ?? `note ${entry.note}`)
    )
    const added: PlanEntry[] = []
    for (const entry of sortEntries(before.filter(shown))) {
      if (entry.status === "skipped") continue
      if (entry.anyDay) {
        if (inPool.has(entry.recipe?.id ?? `note ${entry.note}`)) continue
      } else if (taken.has(`${addDays(entry.date, 7)} ${entry.meal}`)) {
        continue
      }
      added.push(
        tx.create(PlanEntry, {
          household: householdId,
          date: entry.anyDay ? weekStart : addDays(entry.date, 7),
          anyDay: entry.anyDay,
          meal: entry.meal,
          position: entry.position,
          recipe: entry.recipe,
          withRecipe: entry.withRecipe?.getEntity()?.deletedAt
            ? null
            : entry.withRecipe,
          note: entry.note,
          servings: entry.servings,
          status: "planned",
        })
      )
    }
    await tx.flush()
    return sortEntries(added).map(describeEntry)
  })
}

/**
 * Clears what's still planned for the rest of the week (from today in this
 * week, all of it in another), and its pool. Cooked and skipped meals stay.
 * Says what went, to put it back.
 */
export async function clearRest(
  em: EntityManager,
  householdId: string,
  weekStart: string
) {
  checkDay(weekStart, "week")
  const { today } = await householdClock(em, householdId)
  const end = addDays(weekStart, 6)
  const from = today >= weekStart && today <= end ? today : weekStart
  return inHouseholdTransaction(em, householdId, async (tx) => {
    const entries = (
      await tx.find(
        PlanEntry,
        {
          status: "planned",
          $or: [
            { anyDay: false, date: { $gte: from, $lte: end } },
            { anyDay: true, date: weekStart },
          ],
        },
        { populate: POPULATE, ...WITH_DELETED }
      )
    ).filter(shown)
    const before = sortEntries(entries).map(snapshotOf)
    tx.remove(entries)
    await tx.flush()
    return before
  })
}

/** What's next: the next meal still planned, by the household's clock. */
export async function whatsNext(em: EntityManager, householdId: string) {
  const clock = await householdClock(em, householdId)
  const entries = await em.find(
    PlanEntry,
    {
      status: "planned",
      anyDay: false,
      date: { $gte: clock.today, $lte: addDays(clock.today, NEXT_DAYS) },
    },
    { populate: POPULATE, ...WITH_DELETED }
  )
  const next = nextMeal(entries.filter(shown), clock)
  return {
    today: clock.today,
    mealNow: mealOfTheHour(clock.hour),
    entry: next ? describeEntry(next) : null,
  }
}

/**
 * Made it, from the recipe or the cook view: today's planned meal of it is
 * cooked. Failing that, one in this week's pool becomes today's, cooked.
 */
export async function cookedToday(
  em: EntityManager,
  householdId: string,
  recipeId: string
) {
  const clock = await householdClock(em, householdId)
  const today = await em.find(
    PlanEntry,
    { recipe: recipeId, date: clock.today, anyDay: false, status: "planned" },
    { populate: POPULATE }
  )
  let entries = today
  if (entries.length === 0) {
    const pooled = await em.findOne(
      PlanEntry,
      {
        recipe: recipeId,
        anyDay: true,
        status: "planned",
        date: weekStartOf(clock.today, clock.weekStartsOn),
      },
      { populate: POPULATE }
    )
    if (pooled) {
      const meal: Meal = clock.meals.includes(mealOfTheHour(clock.hour))
        ? mealOfTheHour(clock.hour)
        : "dinner"
      pooled.position = await nextPosition(em, {
        date: clock.today,
        meal,
        anyDay: false,
      })
      pooled.date = clock.today
      pooled.anyDay = false
      pooled.meal = meal
      entries = [pooled]
    }
  }
  for (const entry of entries) setStatus(entry, "cooked")
  await em.flush()
  return entries.length
}
