import {
  STORE_SECTIONS as SHARED_SECTIONS,
  UNITS as SHARED_UNITS,
} from "@mise/shared"

import type { storeSections, units } from "./schema.ts"

type NewUnit = typeof units.$inferInsert
type NewStoreSection = typeof storeSections.$inferInsert

/** The same units the ingredient parser knows, from @mise/shared. */
export const UNITS: NewUnit[] = SHARED_UNITS

/** Store sections, from @mise/shared (the web app groups the list by them). */
export const STORE_SECTIONS: NewStoreSection[] = SHARED_SECTIONS.map((s) => ({
  ...s,
}))
