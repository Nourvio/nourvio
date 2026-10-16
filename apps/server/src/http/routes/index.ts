import type { AppDeps } from "../../core/context.ts"
import type { Router } from "../router.ts"
import authRoutes from "./auth/index.ts"
import capabilitiesRoutes from "./capabilities/index.ts"
import healthRoutes from "./health/index.ts"
import householdsRoutes from "./households/index.ts"
import recipesRoutes from "./recipes/index.ts"
import settingsRoutes from "./settings/index.ts"
import telemetryRoutes from "./telemetry/index.ts"

/**
 * Every route under /api. Each part of a route's path is a folder, and
 * its methods are files in it: GET /api/recipes is recipes/get.ts. Index
 * files only register their folder's routes and its folders.
 */
export default (router: Router, deps: AppDeps) => {
  authRoutes(router, deps)
  capabilitiesRoutes(router, deps)
  healthRoutes(router, deps)
  householdsRoutes(router, deps)
  recipesRoutes(router, deps)
  settingsRoutes(router, deps)
  telemetryRoutes(router, deps)
}
