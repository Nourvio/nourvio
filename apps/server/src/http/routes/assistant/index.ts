import type { AppDeps } from "../../../core/context.ts"
import type { Router } from "../../router.ts"
import chatsRoutes from "./chats/index.ts"
import photosRoutes from "./photos/index.ts"

export default (router: Router, deps: AppDeps) => {
  chatsRoutes(router, deps)
  photosRoutes(router, deps)
}
