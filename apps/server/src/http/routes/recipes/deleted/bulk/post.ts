import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../../core/context.ts"
import { bulkDeleted } from "../../../../../services/recipes/deleted.ts"
import { inHousehold } from "../../../../middleware/auth.ts"
import type { Router } from "../../../../router.ts"
import {
  BulkResultSchema,
  DeletedBulkInputSchema,
} from "../../../../schemas/recipes.ts"
import {
  errorResponse,
  jsonResponse,
  SESSION_OR_API_KEY_SECURITY,
  SIGNED_IN_ERRORS,
} from "../../../../schemas/responses.ts"

const route = createRoute({
  method: "post",
  path: "/recipes/deleted/bulk",
  tags: ["Recipes"],
  summary: "Put back, or delete for good, several recipes at once",
  description:
    "For recipes in Recently deleted, up to 500 at a time. Ones that aren't there are skipped. With an API key, it needs the `recipes: write` permission.",
  security: SESSION_OR_API_KEY_SECURITY,
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: DeletedBulkInputSchema } },
    },
  },
  responses: {
    200: jsonResponse(BulkResultSchema, "Done."),
    400: errorResponse("Nothing picked, or something else is off."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, { files }: AppDeps) => {
  router.openapi(route, async (c) => {
    const { em } = inHousehold(c, { area: "recipes", access: "write" })
    return c.json(await bulkDeleted(em, files, c.req.valid("json")), 200)
  })
}
