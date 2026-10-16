import { createRoute, z } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../../core/context.ts"
import { findRecipe } from "../../../../../services/recipes/recipes.ts"
import { listVersions } from "../../../../../services/recipes/versions.ts"
import { inHousehold } from "../../../../middleware/auth.ts"
import type { Router } from "../../../../router.ts"
import { RecipeParam, VersionSchema } from "../../../../schemas/recipes.ts"
import {
  errorResponse,
  jsonResponse,
  SESSION_OR_API_KEY_SECURITY,
  SIGNED_IN_ERRORS,
} from "../../../../schemas/responses.ts"

const route = createRoute({
  method: "get",
  path: "/recipes/{recipe}/versions",
  tags: ["Recipes"],
  summary: "A recipe's earlier versions",
  description:
    "How it was before each change, newest first, so any change can be undone. The last 50 are kept. With an API key, it needs the `recipes: read` permission.",
  security: SESSION_OR_API_KEY_SECURITY,
  request: { params: RecipeParam },
  responses: {
    200: jsonResponse(z.array(VersionSchema), "The versions."),
    404: errorResponse("No such recipe."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, _deps: AppDeps) => {
  router.openapi(route, async (c) => {
    const { em } = inHousehold(c, { area: "recipes", access: "read" })
    const recipe = await findRecipe(em, c.req.valid("param").recipe)
    return c.json(await listVersions(em, recipe.id), 200)
  })
}
