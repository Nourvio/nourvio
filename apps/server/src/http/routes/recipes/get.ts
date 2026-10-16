import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../core/context.ts"
import { listRecipes } from "../../../services/recipes/recipes.ts"
import { inHousehold } from "../../middleware/auth.ts"
import type { Router } from "../../router.ts"
import {
  RecipeListQuerySchema,
  RecipeListSchema,
} from "../../schemas/recipes.ts"
import {
  jsonResponse,
  SESSION_OR_API_KEY_SECURITY,
  SIGNED_IN_ERRORS,
} from "../../schemas/responses.ts"

const route = createRoute({
  method: "get",
  path: "/recipes",
  tags: ["Recipes"],
  summary: "Find recipes",
  description:
    "The household's recipes, a page at a time: searched, filtered by tags, and sorted. With an API key, it needs the `recipes: read` permission.",
  security: SESSION_OR_API_KEY_SECURITY,
  request: { query: RecipeListQuerySchema },
  responses: {
    200: jsonResponse(RecipeListSchema, "The recipes that match."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, _deps: AppDeps) => {
  router.openapi(route, async (c) => {
    const { em } = inHousehold(c, { area: "recipes", access: "read" })
    return c.json(await listRecipes(em, c.req.valid("query")), 200)
  })
}
