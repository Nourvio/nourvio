import { pino } from "pino"
import { createApp } from "../../app.ts"
import { loadConfig } from "../../core/config.ts"
import { migrate, openDatabase } from "../../database/orm.ts"
import { createAuth } from "../../services/auth/auth.ts"
import { SetupCode } from "../../services/auth/setup-code.ts"
import { buildOpenApiDocument, DEFAULT_SERVER_URL } from "./document.ts"

/**
 * The API reference as it's published: built from a throwaway app, so it's
 * the same whoever makes it and wherever it's made.
 */
export async function createOpenApiFile(): Promise<string> {
  const config = {
    ...loadConfig({}),
    database: { kind: "sqlite" as const, file: ":memory:" },
    publicUrl: DEFAULT_SERVER_URL,
  }
  const database = await openDatabase(config.database)
  try {
    await migrate(database)
    const secret = "only used to describe the API, never to sign anything"
    const auth = createAuth({ config, database, secret })
    const app = createApp({
      config,
      logger: pino({ level: "silent" }),
      database,
      auth,
      setupCode: new SetupCode(),
    })
    const document = await buildOpenApiDocument(app, auth, {
      version: config.version,
      serverUrl: DEFAULT_SERVER_URL,
    })
    return `${JSON.stringify(document, null, 2)}\n`
  } finally {
    await database.close()
  }
}
