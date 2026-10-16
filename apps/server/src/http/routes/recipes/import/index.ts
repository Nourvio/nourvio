import type { AppDeps } from "../../../../core/context.ts"
import type { Router } from "../../../router.ts"
import linksRoutes from "./links/index.ts"
import post from "./post.ts"

export default (router: Router, deps: AppDeps) => {
  post(router, deps)
  linksRoutes(router, deps)
}
