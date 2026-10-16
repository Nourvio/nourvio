import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../../core/context.ts"
import { deleteTag } from "../../../../../services/recipes/tags.ts"
import { inHousehold } from "../../../../middleware/auth.ts"
import type { Router } from "../../../../router.ts"
import { TagParam } from "../../../../schemas/recipes.ts"
import {
  errorResponse,
  SESSION_OR_API_KEY_SECURITY,
  SIGNED_IN_ERRORS,
} from "../../../../schemas/responses.ts"

const route = createRoute({
  method: "delete",
  path: "/recipes/tags/{tagId}",
  tags: ["Recipes"],
  summary: "Delete a tag",
  description:
    "Takes it off every recipe. The recipes stay. With an API key, it needs the `recipes: write` permission.",
  security: SESSION_OR_API_KEY_SECURITY,
  request: { params: TagParam },
  responses: {
    204: { description: "Deleted." },
    404: errorResponse("No such tag."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, _deps: AppDeps) => {
  router.openapi(route, async (c) => {
    const { em } = inHousehold(c, { area: "recipes", access: "write" })
    await deleteTag(em, c.req.valid("param").tagId)
    return c.body(null, 204)
  })
}
