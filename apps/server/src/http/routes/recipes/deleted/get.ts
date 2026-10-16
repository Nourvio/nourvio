import { createRoute, z } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../core/context.ts"
import {
  KEEP_DELETED_DAYS,
  listDeleted,
} from "../../../../services/recipes/deleted.ts"
import { inHousehold } from "../../../middleware/auth.ts"
import type { Router } from "../../../router.ts"
import { DeletedRecipeSchema } from "../../../schemas/recipes.ts"
import {
  jsonResponse,
  SESSION_OR_API_KEY_SECURITY,
  SIGNED_IN_ERRORS,
} from "../../../schemas/responses.ts"

const route = createRoute({
  method: "get",
  path: "/recipes/deleted",
  tags: ["Recipes"],
  summary: "Recently deleted",
  description: `Deleted recipes, which can be put back for ${KEEP_DELETED_DAYS} days, latest first. With an API key, it needs the \`recipes: read\` permission.`,
  security: SESSION_OR_API_KEY_SECURITY,
  responses: {
    200: jsonResponse(z.array(DeletedRecipeSchema), "What's there."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, { files }: AppDeps) => {
  router.openapi(route, async (c) => {
    const { em } = inHousehold(c, { area: "recipes", access: "read" })
    return c.json(await listDeleted(em, files), 200)
  })
}
