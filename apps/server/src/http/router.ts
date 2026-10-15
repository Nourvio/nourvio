import { OpenAPIHono } from "@hono/zod-openapi"
import type { AppEnv } from "../core/context.ts"
import { errorBody, fieldErrors } from "./errors.ts"

/**
 * A router for a group of routes. Use it for every group, so invalid input
 * always gets the standard error with a message per field.
 */
export function createRouter() {
  return new OpenAPIHono<AppEnv>({
    defaultHook: (result, c) => {
      if (!result.success) {
        return c.json(
          errorBody(
            "invalid_request",
            "Some of what was sent isn't right.",
            fieldErrors(result.error)
          ),
          400
        )
      }
    },
  })
}
