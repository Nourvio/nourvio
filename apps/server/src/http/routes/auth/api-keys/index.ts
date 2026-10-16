import type { AppDeps } from "../../../../core/context.ts"
import type { Router } from "../../../router.ts"
import revoke from "./[keyId].delete.ts"
import current from "./current.get.ts"

export default (router: Router, deps: AppDeps) => {
  current(router, deps)
  revoke(router, deps)
}
