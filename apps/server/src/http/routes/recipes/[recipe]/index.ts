import type { AppDeps } from "../../../../core/context.ts"
import type { Router } from "../../../router.ts"
import remove from "./delete.ts"
import get from "./get.ts"
import photoRoutes from "./photo/index.ts"
import put from "./put.ts"
import ratingRoutes from "./rating/index.ts"
import versionsRoutes from "./versions/index.ts"

export default (router: Router, deps: AppDeps) => {
  get(router, deps)
  put(router, deps)
  remove(router, deps)
  photoRoutes(router, deps)
  ratingRoutes(router, deps)
  versionsRoutes(router, deps)
}
