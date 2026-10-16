import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../../core/context.ts"
import { markMade } from "../../../../../services/recipes/recipes.ts"
import { inHousehold } from "../../../../middleware/auth.ts"
import type { Router } from "../../../../router.ts"
import { RecipeParam, RecipeSchema } from "../../../../schemas/recipes.ts"
import {
  errorResponse,
  jsonResponse,
  SESSION_OR_API_KEY_SECURITY,
  SIGNED_IN_ERRORS,
} from "../../../../schemas/responses.ts"

const route = createRoute({
  method: "post",
  path: "/recipes/{recipe}/made",
  tags: ["Recipes"],
  summary: "Mark a recipe made",
  description:
    "The recipe was made now: its `lastMadeAt` is set. It isn't an edit, so no version is kept. With an API key, it needs the `recipes: write` permission.",
  security: SESSION_OR_API_KEY_SECURITY,
  request: { params: RecipeParam },
  responses: {
    200: jsonResponse(RecipeSchema, "The recipe, made now."),
    404: errorResponse("No such recipe."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, _deps: AppDeps) => {
  router.openapi(route, async (c) => {
    const { em } = inHousehold(c, { area: "recipes", access: "write" })
    const recipe = await markMade(em, { recipe: c.req.valid("param").recipe })
    return c.json(recipe, 200)
  })
}
