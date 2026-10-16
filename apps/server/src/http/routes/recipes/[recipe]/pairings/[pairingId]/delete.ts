import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../../../core/context.ts"
import { removePairing } from "../../../../../../services/recipes/pairings.ts"
import { inHousehold } from "../../../../../middleware/auth.ts"
import type { Router } from "../../../../../router.ts"
import {
  PairingParam,
  RecipePairingsSchema,
} from "../../../../../schemas/recipes.ts"
import {
  errorResponse,
  jsonResponse,
  SESSION_OR_API_KEY_SECURITY,
  SIGNED_IN_ERRORS,
} from "../../../../../schemas/responses.ts"

const route = createRoute({
  method: "delete",
  path: "/recipes/{recipe}/pairings/{pairingId}",
  tags: ["Recipes"],
  summary: "Take something off what a recipe goes with",
  description:
    "The recipes stay. With an API key, it needs the `recipes: write` permission.",
  security: SESSION_OR_API_KEY_SECURITY,
  request: { params: PairingParam },
  responses: {
    200: jsonResponse(RecipePairingsSchema, "What it goes with now."),
    404: errorResponse("No such recipe or pairing."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, _deps: AppDeps) => {
  router.openapi(route, async (c) => {
    const { em } = inHousehold(c, { area: "recipes", access: "write" })
    const { recipe, pairingId } = c.req.valid("param")
    return c.json(await removePairing(em, { recipe, pairingId }), 200)
  })
}
