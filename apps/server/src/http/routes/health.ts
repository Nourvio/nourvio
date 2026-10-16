import { createRoute, z } from "@hono/zod-openapi"
import type { AppDeps } from "../../core/context.ts"
import { ErrorSchema, errorBody } from "../errors.ts"
import { createRouter } from "../router.ts"

const HealthSchema = z
  .object({
    status: z.literal("ok"),
    version: z.string().openapi({ example: "0.1.0" }),
  })
  .openapi("Health")

const ReadySchema = z
  .object({
    status: z.literal("ready"),
    database: z.enum(["sqlite", "postgres"]),
  })
  .openapi("Ready")

const health = createRoute({
  method: "get",
  path: "/health",
  tags: ["Server"],
  summary: "Check the server is up",
  description:
    "Answers as long as the server is running. Needs no sign-in, and says nothing personal.",
  responses: {
    200: {
      description: "The server is up.",
      content: { "application/json": { schema: HealthSchema } },
    },
  },
})

const ready = createRoute({
  method: "get",
  path: "/health/ready",
  tags: ["Server"],
  summary: "Check the server can do its work",
  description:
    "Checks the database answers and is up to date. For uptime monitors. Needs no sign-in.",
  responses: {
    200: {
      description: "Ready.",
      content: { "application/json": { schema: ReadySchema } },
    },
    503: {
      description: "Not ready: the database is unreachable or out of date.",
      content: { "application/json": { schema: ErrorSchema } },
    },
  },
})

export function healthRoutes({ config, database }: AppDeps) {
  return createRouter()
    .openapi(health, (c) =>
      c.json({ status: "ok" as const, version: config.version }, 200)
    )
    .openapi(ready, async (c) => {
      try {
        await c.var.em.getConnection().execute("select 1")
        const pending = await database.migrator.getPending()
        if (pending.length > 0) {
          return c.json(
            errorBody("not_ready", "The database needs updating."),
            503
          )
        }
      } catch (err) {
        c.var.logger.warn({ err }, "Database check failed")
        return c.json(
          errorBody("not_ready", "The database isn't answering."),
          503
        )
      }
      return c.json(
        { status: "ready" as const, database: config.database.kind },
        200
      )
    })
}
