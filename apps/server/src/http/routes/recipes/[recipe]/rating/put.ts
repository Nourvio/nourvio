import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../../core/context.ts"
import { setRating } from "../../../../../services/recipes/recipes.ts"
import { inHousehold } from "../../../../middleware/auth.ts"
import type { Router } from "../../../../router.ts"
import {
  RatingInputSchema,
  RecipeParam,
  RecipeSchema,
} from "../../../../schemas/recipes.ts"
import {
  errorResponse,
  jsonResponse,
  SESSION_OR_API_KEY_SECURITY,
  SIGNED_IN_ERRORS,
} from "../../../../schemas/responses.ts"

const route = createRoute({
  method: "put",
  path: "/recipes/{recipe}/rating",
  tags: ["Recipes"],
  summary: "Rate a recipe",
  description:
    "Sets the recipe's stars, or clears them. It isn't an edit, so no version is kept. With an API key, it needs the `recipes: write` permission.",
  security: SESSION_OR_API_KEY_SECURITY,
  request: {
    params: RecipeParam,
    body: {
      required: true,
      content: { "application/json": { schema: RatingInputSchema } },
    },
  },
  responses: {
    200: jsonResponse(RecipeSchema, "The recipe, with its new rating."),
    400: errorResponse("The rating isn't from 1 to 5."),
    404: errorResponse("No such recipe."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, _deps: AppDeps) => {
  router.openapi(route, async (c) => {
    const { em } = inHousehold(c, { area: "recipes", access: "write" })
    const recipe = await setRating(em, {
      recipe: c.req.valid("param").recipe,
      rating: c.req.valid("json").rating,
    })
    return c.json(recipe, 200)
  })
}
