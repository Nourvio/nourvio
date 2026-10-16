import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../../core/context.ts"
import { deleteForGood } from "../../../../../services/recipes/deleted.ts"
import { inHousehold } from "../../../../middleware/auth.ts"
import type { Router } from "../../../../router.ts"
import { DeletedRecipeParam } from "../../../../schemas/recipes.ts"
import {
  errorResponse,
  SESSION_OR_API_KEY_SECURITY,
  SIGNED_IN_ERRORS,
} from "../../../../schemas/responses.ts"

const route = createRoute({
  method: "delete",
  path: "/recipes/deleted/{recipeId}",
  tags: ["Recipes"],
  summary: "Delete a recipe for good",
  description:
    "Only for a recipe in Recently deleted. This can't be undone. With an API key, it needs the `recipes: write` permission.",
  security: SESSION_OR_API_KEY_SECURITY,
  request: { params: DeletedRecipeParam },
  responses: {
    204: { description: "Deleted for good." },
    404: errorResponse("No such recipe in Recently deleted."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, { files }: AppDeps) => {
  router.openapi(route, async (c) => {
    const { em } = inHousehold(c, { area: "recipes", access: "write" })
    await deleteForGood(em, files, c.req.valid("param").recipeId)
    return c.body(null, 204)
  })
}
