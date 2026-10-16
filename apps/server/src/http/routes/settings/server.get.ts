import { createRoute } from "@hono/zod-openapi"
import type { AppDeps } from "../../../core/context.ts"
import { serverAdmin } from "../../middleware/auth.ts"
import type { Router } from "../../router.ts"
import {
  jsonResponse,
  SESSION_SECURITY,
  SIGNED_IN_ERRORS,
} from "../../schemas/responses.ts"
import { ServerSettingsSchema } from "../../schemas/settings.ts"

const route = createRoute({
  method: "get",
  path: "/settings/server",
  tags: ["Settings"],
  summary: "The server's settings",
  description:
    "Server admins only. Every server setting that can be seen here, with where its value comes from, and a little about the server.",
  security: SESSION_SECURITY,
  responses: {
    200: jsonResponse(ServerSettingsSchema, "The settings."),
    ...SIGNED_IN_ERRORS,
  },
})

/** The server's settings, as GET and PATCH /api/settings/server answer. */
export async function describeServerSettings({ config, settings }: AppDeps) {
  return {
    about: {
      version: config.version,
      installMethod: config.installMethod,
      database: config.database.kind,
      publicUrl: config.publicUrl ?? null,
    },
    settings: await settings.describeServer(),
  }
}

export default (router: Router, deps: AppDeps) => {
  router.openapi(route, async (c) => {
    serverAdmin(c)
    return c.json(await describeServerSettings(deps), 200)
  })
}
