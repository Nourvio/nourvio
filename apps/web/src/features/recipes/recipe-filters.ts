import { DIETS, type Diet, type RecipeSummary } from "@mise/shared"

export const SORTS = [
  { id: "newest", label: "Newest" },
  { id: "name", label: "Name" },
  { id: "rating", label: "Top rated" },
  { id: "made", label: "Recently made" },
  { id: "quickest", label: "Quickest" },
] as const
export type RecipeSort = (typeof SORTS)[number]["id"]

/** "Under 30 min" and so on. */
export const TIMES = [15, 30, 45, 60] as const

export type RecipeFilters = {
  q: string
  tags: string[]
  diets: Diet[]
  /** Ready in at most this many minutes. */
  time: number | null
  sort: RecipeSort
}

/** Filters live in the URL, so a filtered view can be bookmarked or shared. */
export function readFilters(params: URLSearchParams): RecipeFilters {
  const time = Number(params.get("time"))
  const sort = params.get("sort")
  return {
    q: params.get("q") ?? "",
    tags: params.getAll("tag"),
    diets: params
      .getAll("diet")
      .filter((d): d is Diet => (DIETS as readonly string[]).includes(d)),
    time: (TIMES as readonly number[]).includes(time) ? time : null,
    sort: SORTS.some((s) => s.id === sort) ? (sort as RecipeSort) : "newest",
  }
}

export function writeFilters(
  current: URLSearchParams,
  change: Partial<RecipeFilters>
) {
  const next = new URLSearchParams(current)
  if (change.q !== undefined) {
    if (change.q) next.set("q", change.q)
    else next.delete("q")
  }
  if (change.tags) {
    next.delete("tag")
    for (const tag of change.tags) next.append("tag", tag)
  }
  if (change.diets) {
    next.delete("diet")
    for (const diet of change.diets) next.append("diet", diet)
  }
  if (change.time !== undefined) {
    if (change.time) next.set("time", String(change.time))
    else next.delete("time")
  }
  if (change.sort) {
    if (change.sort === "newest") next.delete("sort")
    else next.set("sort", change.sort)
  }
  return next
}

const lower = (s: string) => s.toLowerCase()

/** The recipes that pass the tag, diet and time filters (search is done by the server). */
export function filterRecipes(
  recipes: RecipeSummary[],
  filters: Pick<RecipeFilters, "tags" | "diets" | "time">
) {
  const tags = filters.tags.map(lower)
  return recipes.filter(
    (recipe) =>
      tags.every((tag) => recipe.tags.some((t) => lower(t) === tag)) &&
      filters.diets.every((diet) => recipe.diets.includes(diet)) &&
      (!filters.time ||
        (recipe.totalMinutes !== null && recipe.totalMinutes <= filters.time))
  )
}

const last = Number.POSITIVE_INFINITY

export function sortRecipes(recipes: RecipeSummary[], sort: RecipeSort) {
  const byName = (a: RecipeSummary, b: RecipeSummary) =>
    a.name.localeCompare(b.name)
  const sorted = [...recipes]
  switch (sort) {
    case "name":
      return sorted.sort(byName)
    case "rating":
      return sorted.sort(
        (a, b) => (b.rating ?? 0) - (a.rating ?? 0) || byName(a, b)
      )
    case "made":
      return sorted.sort(
        (a, b) =>
          (b.lastMadeAt ? Date.parse(b.lastMadeAt) : 0) -
            (a.lastMadeAt ? Date.parse(a.lastMadeAt) : 0) || byName(a, b)
      )
    case "quickest":
      return sorted.sort(
        (a, b) =>
          (a.totalMinutes ?? last) - (b.totalMinutes ?? last) || byName(a, b)
      )
    default:
      return sorted.sort(
        (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)
      )
  }
}

/** How many of these recipes have each tag, biggest first. */
export function countTags(recipes: RecipeSummary[]) {
  const counts = new Map<string, { name: string; count: number }>()
  for (const recipe of recipes) {
    for (const tag of recipe.tags) {
      const found = counts.get(lower(tag))
      if (found) found.count++
      else counts.set(lower(tag), { name: tag, count: 1 })
    }
  }
  return [...counts.values()].sort(
    (a, b) => b.count - a.count || a.name.localeCompare(b.name)
  )
}

export function countDiets(recipes: RecipeSummary[]) {
  return Object.fromEntries(
    DIETS.map((diet) => [
      diet,
      recipes.filter((recipe) => recipe.diets.includes(diet)).length,
    ])
  ) as Record<Diet, number>
}
