import type { AppDeps } from "../../../../core/context.ts"
import type { Router } from "../../../router.ts"
import applyRoutes from "./apply/index.ts"
import dismissRoutes from "./dismiss/index.ts"

export default (router: Router, deps: AppDeps) => {
  applyRoutes(router, deps)
  dismissRoutes(router, deps)
}
