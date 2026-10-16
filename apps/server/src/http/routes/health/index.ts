import type { AppDeps } from "../../../core/context.ts"
import type { Router } from "../../router.ts"
import ready from "./ready.get.ts"

export default (router: Router, deps: AppDeps) => {
  ready(router, deps)
}
