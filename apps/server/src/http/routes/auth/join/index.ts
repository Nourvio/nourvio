import type { AppDeps } from "../../../../core/context.ts"
import type { Router } from "../../../router.ts"
import invite from "./[token].get.ts"
import join from "./[token].post.ts"

export default (router: Router, deps: AppDeps) => {
  invite(router, deps)
  join(router, deps)
}
