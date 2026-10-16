import type { AppDeps } from "../../core/context.ts"
import type { Router } from "../router.ts"
import authRoutes from "./auth/index.ts"
import health from "./health.get.ts"
import healthRoutes from "./health/index.ts"
import startHousehold from "./households.post.ts"
import householdRoutes from "./households/index.ts"

/**
 * Every route under /api. Index files only register: each route is a file
 * of its own, where its path says.
 */
export default (router: Router, deps: AppDeps) => {
  health(router, deps)
  healthRoutes(router, deps)
  startHousehold(router, deps)
  householdRoutes(router, deps)
  authRoutes(router, deps)
}
