import type { AppDeps } from "../../../core/context.ts"
import type { Router } from "../../router.ts"
import household from "./household.get.ts"
import changeHousehold from "./household.patch.ts"
import server from "./server.get.ts"
import changeServer from "./server.patch.ts"

export default (router: Router, deps: AppDeps) => {
  server(router, deps)
  changeServer(router, deps)
  household(router, deps)
  changeHousehold(router, deps)
}
