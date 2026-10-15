import { CLEANUP_SECTIONS, type ImportResult } from "@mise/shared"

import type { AiService } from "../ai/service.ts"
import type { Db } from "../db/client.ts"
import { proposeCleanup } from "./cleanup.ts"
import { getHousehold } from "./households.ts"
import type { NutritionService } from "./nutrition.ts"
import type { PhotoService } from "./photos.ts"

export type AfterImport = (
  result: ImportResult,
  actor: { userId: string; householdId: string }
) => Promise<void>

/**
 * What follows a new import, however it came in: nutrition and a photo in
 * the background, and with auto-cleanup on, a tidy-up whose suggestions wait
 * on the recipe page. A failure here doesn't matter.
 */
export function importFollowUp(
  db: Db,
  ai: AiService,
  nutrition: NutritionService,
  photos: PhotoService
): AfterImport {
  return async (result, actor) => {
    if (result.duplicate) return
    nutrition.afterSave(actor, result.recipe)
    photos.afterCreate(actor, result.recipe)
    if (!(await getHousehold(db, actor.householdId)).autoCleanup) return
    void proposeCleanup(db, ai, actor.householdId, result.recipe.id, {
      userId: actor.userId,
      sections: [...CLEANUP_SECTIONS],
    }).catch((error: Error) =>
      console.warn("Tidy-up after import failed:", error.message)
    )
  }
}
