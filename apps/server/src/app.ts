import { Scalar } from "@scalar/hono-api-reference"
import { requestId } from "hono/request-id"
import { secureHeaders } from "hono/secure-headers"
import type { AppDeps } from "./core/context.ts"
import { ErrorSchema, handleError, handleNotFound } from "./http/errors.ts"
import { entityManager } from "./http/middleware/entity-manager.ts"
import { requestLogger } from "./http/middleware/request-logger.ts"
import { createRouter } from "./http/router.ts"
import { healthRoutes } from "./http/routes/health.ts"

export const API_BASE = "/api/v1"
const SPEC_PATH = `${API_BASE}/openapi.json`

export function createApp(deps: AppDeps) {
  const app = createRouter()

  app.use(requestId())
  app.use(secureHeaders())
  app.use(requestLogger(deps.logger))
  app.use(entityManager(deps.database))

  app.route(API_BASE, healthRoutes(deps))

  app.openAPIRegistry.register("Error", ErrorSchema)
  app.doc31(SPEC_PATH, {
    openapi: "3.1.0",
    info: {
      title: "Merran API",
      version: deps.config.version,
      description:
        "Everything the Merran app does, it does through this API. Sign in with a session cookie, or send `Authorization: Bearer mrn_…` with an API key.",
      license: {
        name: "AGPL-3.0-or-later",
        url: "https://www.gnu.org/licenses/agpl-3.0.html",
      },
    },
  })
  app.get("/api/docs", Scalar({ url: SPEC_PATH, pageTitle: "Merran API" }))

  app.notFound(handleNotFound)
  app.onError(handleError)
  return app
}

export type App = ReturnType<typeof createApp>
