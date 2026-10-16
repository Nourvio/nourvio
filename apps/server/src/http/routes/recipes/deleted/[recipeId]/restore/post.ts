import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../../../core/context.ts"
import { restoreDeleted } from "../../../../../../services/recipes/deleted.ts"
import { loadRecipe } from "../../../../../../services/recipes/recipes.ts"
import { inHousehold } from "../../../../../middleware/auth.ts"
import type { Router } from "../../../../../router.ts"
import {
  DeletedRecipeParam,
  RecipeSchema,
} from "../../../../../schemas/recipes.ts"
import {
  errorResponse,
  jsonResponse,
  SESSION_OR_API_KEY_SECURITY,
  SIGNED_IN_ERRORS,
} from "../../../../../schemas/responses.ts"

const route = createRoute({
  method: "post",
  path: "/recipes/deleted/{recipeId}/restore",
  tags: ["Recipes"],
  summary: "Put a recipe back",
  description:
    "Takes a recipe out of Recently deleted, back where it was. With an API key, it needs the `recipes: write` permission.",
  security: SESSION_OR_API_KEY_SECURITY,
  request: { params: DeletedRecipeParam },
  responses: {
    200: jsonResponse(RecipeSchema, "Put back."),
    404: errorResponse("No such recipe in Recently deleted."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, _deps: AppDeps) => {
  router.openapi(route, async (c) => {
    const { em } = inHousehold(c, { area: "recipes", access: "write" })
    const slug = await restoreDeleted(em, c.req.valid("param").recipeId)
    return c.json(await loadRecipe(em, slug), 200)
  })
}
