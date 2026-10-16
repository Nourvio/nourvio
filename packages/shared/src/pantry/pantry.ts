import type { AisleKey } from "../list/aisles.ts"
import { foodKey } from "../list/food.ts"
import { addDays } from "../plan/days.ts"

// What's at home: where it's kept, when to use it by, and what to use
// soon. The server and the web app both work these out, so they agree.

export const STORAGE_PLACES = ["fridge", "freezer", "cupboard"] as const
export type StoragePlace = (typeof STORAGE_PLACES)[number]

/** Prep and quality words that don't make it a different thing to have. */
const SAME_THING =
  /\b(boneless|skinless|bone-in|skin-on|unsalted|salted|low-sodium|reduced-sodium|no-salt-added|low-fat|reduced-fat|fat-free|shredded|grated|chopped|minced|diced|sliced|cubed|peeled|extra-virgin|extra virgin|virgin|yellow)\b/g

/**
 * A food as the pantry matches it: "Boneless skinless chicken thighs" and
 * "chicken thigh" are the same; "cream cheese" and "cheese" are not.
 */
export function pantryKey(name: string) {
  const key = foodKey(name)
  const core = key.replace(SAME_THING, " ").replace(/\s+/g, " ").trim()
  return core || key
}

/** Fresh produce that keeps at room temperature, or for weeks anyway. */
const KEEPS_OUT =
  /\b(onion|garlic|potato|sweet potato|shallot|squash|pumpkin|banana|tomato|avocado|ginger|apple|lemon|lime|orange|mango|pineapple)/

/** A first guess at where something's kept, from its aisle and name. */
export function guessStorage(
  name: string,
  aisle: AisleKey | null
): StoragePlace {
  const text = name.toLowerCase()
  if (aisle === "frozen" || /\bfrozen\b/.test(text)) return "freezer"
  if (aisle === "meat-seafood" || aisle === "dairy-eggs" || aisle === "deli")
    return "fridge"
  if (aisle === "produce") return KEEPS_OUT.test(text) ? "cupboard" : "fridge"
  return "cupboard"
}

/** About how long fresh food keeps, for a first guess at a use-by date. */
const KEEPS_DAYS: Partial<Record<AisleKey, number>> = {
  "meat-seafood": 3,
  deli: 5,
  bakery: 5,
  produce: 7,
}

/** Produce that keeps for weeks, so it gets no use-by guess. */
const LONG_KEEPING =
  /\b(onion|garlic|potato|shallot|squash|pumpkin|cabbage|carrot|apple|lemon|lime|orange|ginger|beet)/

/**
 * A first guess at when fresh food should be used by, from today: none
 * for food that keeps, or what's in the freezer.
 */
export function guessUseBy(
  name: string,
  aisle: AisleKey | null,
  storedIn: StoragePlace | null,
  today: string
) {
  if (storedIn === "freezer" || !aisle) return null
  const days = KEEPS_DAYS[aisle]
  if (!days) return null
  if (aisle === "produce" && LONG_KEEPING.test(name.toLowerCase())) return null
  return addDays(today, days)
}

/** How many days ahead "use soon" looks. */
export const USE_SOON_DAYS = 2

/** Aisles whose food goes off, so leftovers from a skipped meal need using. */
const PERISHABLE: readonly AisleKey[] = [
  "produce",
  "meat-seafood",
  "dairy-eggs",
  "deli",
  "bakery",
]

/** A planned meal something at home was bought for. */
export type PantryMeal = {
  date: string
  status: "planned" | "cooked" | "skipped"
}

export type UseSoonReason =
  /** Its use-by date has gone, or is close. */
  | { kind: "past" | "soon"; date: string }
  /** Fresh food bought for meals that were skipped or went by uncooked. */
  | { kind: "leftover" }

/**
 * Why something at home should be used soon, if it should: its use-by
 * date is close or gone, or it's fresh food bought for meals that were
 * skipped or went by uncooked, with none still to come. What's in the
 * freezer keeps.
 */
export function whyUseSoon(
  item: {
    useBy: string | null
    storedIn: StoragePlace | null
    aisle: AisleKey | null
    meals: readonly PantryMeal[]
  },
  today: string
): UseSoonReason | null {
  if (item.useBy && item.useBy <= addDays(today, USE_SOON_DAYS)) {
    return { kind: item.useBy < today ? "past" : "soon", date: item.useBy }
  }
  if (item.storedIn === "freezer") return null
  if (!item.aisle || !PERISHABLE.includes(item.aisle)) return null
  const missed = item.meals.some(
    (meal) =>
      meal.status === "skipped" ||
      (meal.status === "planned" && meal.date < today)
  )
  const upcoming = item.meals.some(
    (meal) => meal.status === "planned" && meal.date >= today
  )
  return missed && !upcoming ? { kind: "leftover" } : null
}
