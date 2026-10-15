import type { Db } from "./client.ts"
import { STORE_SECTIONS, UNITS } from "./reference-data.ts"
import { storeSections, units } from "./schema.ts"

/**
 * Adds any missing units and store sections. Existing rows are left alone, so
 * edits made in the app survive restarts.
 */
export async function seedReferenceData(db: Db) {
  await db.insert(units).values(UNITS).onConflictDoNothing()
  await db.insert(storeSections).values(STORE_SECTIONS).onConflictDoNothing()
}
