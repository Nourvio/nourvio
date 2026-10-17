import type { AppDeps } from "../../../core/context.ts"
import type { Router } from "../../router.ts"
import costsRoutes from "./costs/index.ts"
import dealsRoutes from "./deals/index.ts"
import get from "./get.ts"
import krogerRoutes from "./kroger/index.ts"

export default (router: Router, deps: AppDeps) => {
  get(router, deps)
  dealsRoutes(router, deps)
  costsRoutes(router, deps)
  krogerRoutes(router, deps)
}
