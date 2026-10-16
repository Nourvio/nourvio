import type { AppDeps } from "../../../core/context.ts"
import { mountBetterAuth } from "./better-auth.ts"
import type { Router } from "../../router.ts"
import listApiKeys from "./api-keys.get.ts"
import makeApiKey from "./api-keys.post.ts"
import apiKeyRoutes from "./api-keys/index.ts"
import joinRoutes from "./join/index.ts"
import me from "./me.get.ts"
import setupStatus from "./setup.get.ts"
import setup from "./setup.post.ts"

export default (router: Router, deps: AppDeps) => {
  setupStatus(router, deps)
  setup(router, deps)
  me(router, deps)
  joinRoutes(router, deps)
  listApiKeys(router, deps)
  makeApiKey(router, deps)
  apiKeyRoutes(router, deps)
  // Better Auth's own endpoints, the ones Merran uses (see better-auth.ts).
  mountBetterAuth(router, deps.auth)
}
