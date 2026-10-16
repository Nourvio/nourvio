import type { AppDeps } from "../../../../../core/context.ts"
import type { Router } from "../../../../router.ts"
import remove from "./[memberId].delete.ts"
import changeRole from "./[memberId].patch.ts"

export default (router: Router, deps: AppDeps) => {
  changeRole(router, deps)
  remove(router, deps)
}
