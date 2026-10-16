import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../../../core/context.ts"
import { applyProposal } from "../../../../../services/recipes/tidy/proposals.ts"
import { inHousehold, openToKeys } from "../../../../middleware/auth.ts"
import type { Router } from "../../../../router.ts"
import {
  errorResponse,
  jsonResponse,
  SIGNED_IN_ERRORS,
} from "../../../../schemas/responses.ts"
import {
  ApplyInputSchema,
  ApplyResultSchema,
  ProposalParam,
} from "../../../../schemas/tidy.ts"

const route = createRoute({
  method: "post",
  path: "/proposals/{proposalId}/apply",
  operationId: "applyProposal",
  tags: ["Review"],
  summary: "Apply a suggestion",
  description:
    "Applies the sections picked, as one change to the recipe that keeps a version of how it was; the rest are skipped. A section changed since it was suggested is refused rather than overwritten, and the error says which.",
  ...openToKeys("recipes", "write"),
  request: {
    params: ProposalParam,
    body: {
      required: true,
      content: { "application/json": { schema: ApplyInputSchema } },
    },
  },
  responses: {
    200: jsonResponse(
      ApplyResultSchema,
      "Applied: the suggestion and the recipe."
    ),
    400: errorResponse("Nothing picked."),
    404: errorResponse("No such suggestion, or its recipe is gone."),
    409: errorResponse("Applied or dismissed already, or the recipe changed."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, _deps: AppDeps) => {
  router.openapi(route, async (c) => {
    const { em, householdId, userId } = inHousehold(c)
    const result = await applyProposal(em, {
      householdId,
      userId,
      proposalId: c.req.valid("param").proposalId,
      sections: c.req.valid("json").sections,
    })
    return c.json(result, 200)
  })
}
