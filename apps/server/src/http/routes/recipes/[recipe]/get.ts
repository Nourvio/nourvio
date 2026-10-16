import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../core/context.ts"
import { loadRecipe } from "../../../../services/recipes/recipes.ts"
import { inHousehold } from "../../../middleware/auth.ts"
import type { Router } from "../../../router.ts"
import { RecipeParam, RecipeSchema } from "../../../schemas/recipes.ts"
import {
  errorResponse,
  jsonResponse,
  SESSION_OR_API_KEY_SECURITY,
  SIGNED_IN_ERRORS,
} from "../../../schemas/responses.ts"

const route = createRoute({
  method: "get",
  path: "/recipes/{recipe}",
  tags: ["Recipes"],
  summary: "A recipe",
  description:
    "With its ingredients, read into amounts, units and foods, and its steps. With an API key, it needs the `recipes: read` permission.",
  security: SESSION_OR_API_KEY_SECURITY,
  request: { params: RecipeParam },
  responses: {
    200: jsonResponse(RecipeSchema, "The recipe."),
    404: errorResponse("No such recipe."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, _deps: AppDeps) => {
  router.openapi(route, async (c) => {
    const { em } = inHousehold(c, { area: "recipes", access: "read" })
    return c.json(await loadRecipe(em, c.req.valid("param").recipe), 200)
  })
}
