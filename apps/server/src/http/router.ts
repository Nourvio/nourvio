import { OpenAPIHono } from "@hono/zod-openapi"
import type { MiddlewareHandler } from "hono"
import type { Logger } from "pino"
import type { AppEnv } from "../context.ts"
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

/** Gives each request a logger tagged with its id, and logs how it went. */
export function requestLogger(logger: Logger): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const log = logger.child({ requestId: c.var.requestId })
    c.set("logger", log)
    const started = performance.now()
    await next()
    log.info(
      {
        method: c.req.method,
        path: c.req.path,
        status: c.res.status,
        ms: Math.round(performance.now() - started),
      },
      "request"
    )
  }
}
