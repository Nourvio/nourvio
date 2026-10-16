import type { AppDeps } from "../../../core/context.ts"
import type { Router } from "../../router.ts"
import newInstallId from "./install-id.post.ts"
import report from "./report.get.ts"

export default (router: Router, deps: AppDeps) => {
  report(router, deps)
  newInstallId(router, deps)
}
