import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../core/context.ts"
import { Household } from "../../../database/entities/index.ts"
import { inHousehold } from "../../middleware/auth.ts"
import type { Router } from "../../router.ts"
import { describeHousehold, HouseholdSchema } from "../../schemas/households.ts"
import {
  jsonResponse,
  SESSION_SECURITY,
  SIGNED_IN_ERRORS,
} from "../../schemas/responses.ts"

const route = createRoute({
  method: "get",
  path: "/households/current",
  tags: ["Households"],
  summary: "The household in use",
  security: SESSION_SECURITY,
  responses: {
    200: jsonResponse(HouseholdSchema, "The household."),
    ...SIGNED_IN_ERRORS,
  },
})

export default (router: Router, _deps: AppDeps) => {
  router.openapi(route, async (c) => {
    const { householdId, role, em } = inHousehold(c)
    const household = await em.findOneOrFail(Household, householdId)
    return c.json(describeHousehold(household, role), 200)
  })
}
