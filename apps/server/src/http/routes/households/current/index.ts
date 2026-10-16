import type { AppDeps } from "../../../../core/context.ts"
import type { Router } from "../../../router.ts"
import invites from "./invites.get.ts"
import invite from "./invites.post.ts"
import inviteRoutes from "./invites/index.ts"
import members from "./members.get.ts"
import memberRoutes from "./members/index.ts"

export default (router: Router, deps: AppDeps) => {
  members(router, deps)
  memberRoutes(router, deps)
  invites(router, deps)
  invite(router, deps)
  inviteRoutes(router, deps)
}
