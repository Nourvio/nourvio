import type { AppDeps } from "../../../core/context.ts"
import type { Router } from "../../router.ts"
import post from "./post.ts"
import currentRoutes from "./current/index.ts"

export default (router: Router, deps: AppDeps) => {
  post(router, deps)
  currentRoutes(router, deps)
}
