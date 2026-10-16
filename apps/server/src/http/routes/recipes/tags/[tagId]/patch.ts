import { createRoute, z } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../../core/context.ts"
import { listTags, renameTag } from "../../../../../services/recipes/tags.ts"
import { inHousehold } from "../../../../middleware/auth.ts"
import type { Router } from "../../../../router.ts"
import {
  TagChangesSchema,
  TagParam,
  TagSchema,
} from "../../../../schemas/recipes.ts"
import {
  errorResponse,
  jsonResponse,
  SESSION_OR_API_KEY_SECURITY,
  SIGNED_IN_ERRORS,
} from "../../../../schemas/responses.ts"

const route = createRoute({
  method: "patch",
  path: "/recipes/tags/{tagId}",
  tags: ["Recipes"],
  summary: "Rename or merge a tag",
  description:
    "Renaming a tag to another tag's name merges them: every recipe with either has the one tag. With an API key, it needs the `recipes: write` permission.",
  security: SESSION_OR_API_KEY_SECURITY,
  request: {
    params: TagParam,
    body: {
      required: true,
      content: { "application/json": { schema: TagChangesSchema } },
    },
  },
  responses: {
    200: jsonResponse(z.array(TagSchema), "All the tags, after the change."),
    404: errorResponse("No such tag."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, _deps: AppDeps) => {
  router.openapi(route, async (c) => {
    const { em, householdId } = inHousehold(c, {
      area: "recipes",
      access: "write",
    })
    await renameTag(
      em,
      householdId,
      c.req.valid("param").tagId,
      c.req.valid("json").name
    )
    return c.json(await listTags(em), 200)
  })
}
