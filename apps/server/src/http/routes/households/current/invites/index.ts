import type { AppDeps } from "../../../../../core/context.ts"
import type { Router } from "../../../../router.ts"
import cancel from "./[inviteId].delete.ts"

export default (router: Router, deps: AppDeps) => {
  cancel(router, deps)
}
