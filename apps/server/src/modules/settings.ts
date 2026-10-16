import type { AnySetting } from "../core/settings.ts"
import { AI } from "./ai/settings.ts"
import { ERROR_TRACKING } from "./error-tracking/settings.ts"
import { TELEMETRY } from "./telemetry/settings.ts"
import { VIDEO } from "./video/settings.ts"

/**
 * Every module's settings, kept apart from the modules themselves so
 * startup can read them from the environment before anything else loads.
 * A module's settings go here and in its module.
 */
export const MODULE_SETTINGS: readonly AnySetting[] = [
  ...Object.values(AI),
  ...Object.values(VIDEO),
  ...Object.values(ERROR_TRACKING),
  ...Object.values(TELEMETRY),
]
