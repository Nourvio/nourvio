import { createRoute, z } from "@hono/zod-openapi"
import type { AppDeps } from "../context.ts"
import { createRouter } from "../http/router.ts"

const HealthSchema = z
  .object({
    status: z.literal("ok"),
    version: z.string().openapi({ example: "0.1.0" }),
  })
  .openapi("Health")

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

export function healthRoutes({ config }: AppDeps) {
  return createRouter().openapi(health, (c) =>
    c.json({ status: "ok" as const, version: config.version }, 200)
  )
}
