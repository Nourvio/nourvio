import type { AppDeps } from "../../../core/context.ts"
import type { Router } from "../../router.ts"
import get from "./get.ts"
import post from "./post.ts"
import deletedRoutes from "./deleted/index.ts"
import tagsRoutes from "./tags/index.ts"
import recipeRoutes from "./[recipe]/index.ts"

export default (router: Router, deps: AppDeps) => {
  get(router, deps)
  post(router, deps)
  // Fixed paths first, so they aren't taken for {recipe}.
  deletedRoutes(router, deps)
  tagsRoutes(router, deps)
  recipeRoutes(router, deps)
}
