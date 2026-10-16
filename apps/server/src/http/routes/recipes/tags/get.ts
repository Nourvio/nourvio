import { createRoute, z } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../core/context.ts"
import { listTags } from "../../../../services/recipes/tags.ts"
import { inHousehold } from "../../../middleware/auth.ts"
import type { Router } from "../../../router.ts"
import { TagSchema } from "../../../schemas/recipes.ts"
import {
  jsonResponse,
  SESSION_OR_API_KEY_SECURITY,
  SIGNED_IN_ERRORS,
} from "../../../schemas/responses.ts"

const route = createRoute({
  method: "get",
  path: "/recipes/tags",
  tags: ["Recipes"],
  summary: "Recipe tags",
  description:
    "The household's tags, with how many recipes have each, alphabetically. With an API key, it needs the `recipes: read` permission.",
  security: SESSION_OR_API_KEY_SECURITY,
  responses: {
    200: jsonResponse(z.array(TagSchema), "The tags."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, _deps: AppDeps) => {
  router.openapi(route, async (c) => {
    const { em } = inHousehold(c, { area: "recipes", access: "read" })
    return c.json(await listTags(em), 200)
  })
}
