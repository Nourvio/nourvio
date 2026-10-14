import { serve } from "@hono/node-server"

import { createApp } from "./app.ts"
import { config } from "./config.ts"
import { closeDatabase } from "./db.ts"

const server = serve(
  { fetch: createApp().fetch, port: config.port, hostname: "0.0.0.0" },
  (info) => console.log(`Mise ${config.version} listening on port ${info.port}`)
)

function shutdown(signal: string) {
  console.log(`${signal} received, shutting down`)
  server.close(() => {
    closeDatabase().finally(() => process.exit(0))
  })
  // Don't hang forever on open connections.
  setTimeout(() => process.exit(1), 10_000).unref()
}

process.on("SIGTERM", () => shutdown("SIGTERM"))
process.on("SIGINT", () => shutdown("SIGINT"))
