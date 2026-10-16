import type { AppDeps } from "../../../../core/context.ts"
import type { Router } from "../../../router.ts"
import get from "./get.ts"
import patch from "./patch.ts"
import invitesRoutes from "./invites/index.ts"
import membersRoutes from "./members/index.ts"

export default (router: Router, deps: AppDeps) => {
  get(router, deps)
  patch(router, deps)
  invitesRoutes(router, deps)
  membersRoutes(router, deps)
}
