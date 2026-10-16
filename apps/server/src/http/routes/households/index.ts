import type { AppDeps } from "../../../core/context.ts"
import type { Router } from "../../router.ts"
import current from "./current.get.ts"
import changeCurrent from "./current.patch.ts"
import currentRoutes from "./current/index.ts"

export default (router: Router, deps: AppDeps) => {
  current(router, deps)
  changeCurrent(router, deps)
  currentRoutes(router, deps)
}
