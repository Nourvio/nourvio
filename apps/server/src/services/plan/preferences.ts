import {
  NO_TASTES,
  NO_THEMES,
  type HouseholdTastes,
  type NightTheme,
  type WeekThemes,
} from "@merran/shared"
import type { EntityManager } from "@mikro-orm/sql"
import { Household } from "../../database/entities/index.ts"

// What a household eats and its theme nights, which Fill the week and the
// autoplan keep to. Both live in the household's settings.

export async function getTastes(
  em: EntityManager,
  householdId: string
): Promise<HouseholdTastes> {
  const household = await em.findOneOrFail(Household, { id: householdId })
  return { ...NO_TASTES, ...household.settings?.tastes }
}

export async function saveTastes(
  em: EntityManager,
  householdId: string,
  tastes: HouseholdTastes
): Promise<HouseholdTastes> {
  const household = await em.findOneOrFail(Household, { id: householdId })
  // One of each food, an allergy winning over a dislike.
  const foods = new Map<string, HouseholdTastes["avoid"][number]>()
  for (const { food, allergy } of tastes.avoid) {
    const key = food.trim().toLowerCase()
    const known = foods.get(key)
    foods.set(key, { food: food.trim(), allergy: allergy || !!known?.allergy })
  }
  const saved: HouseholdTastes = {
    avoid: [...foods.values()],
    diets: [...new Set(tastes.diets)],
    weeknightMinutes: tastes.weeknightMinutes,
  }
  household.settings = { ...household.settings, tastes: saved }
  await em.flush()
  return saved
}

export async function getThemes(
  em: EntityManager,
  householdId: string
): Promise<WeekThemes> {
  const household = await em.findOneOrFail(Household, { id: householdId })
  return household.settings?.themes ?? NO_THEMES
}

export async function saveThemes(
  em: EntityManager,
  householdId: string,
  themes: readonly (NightTheme | null)[]
): Promise<WeekThemes> {
  const household = await em.findOneOrFail(Household, { id: householdId })
  const saved = themes.map((theme) =>
    theme
      ? {
          kind: theme.kind,
          name: theme.name.trim(),
          // Only a tag theme has a tag.
          ...(theme.kind === "tag" && theme.tag
            ? { tag: theme.tag.trim().toLowerCase() }
            : {}),
        }
      : null
  )
  household.settings = { ...household.settings, themes: saved }
  await em.flush()
  return saved
}
