import { tmpdir } from "node:os"
import { join } from "node:path"
import { pino } from "pino"
import { createApp } from "../../app.ts"
import { loadConfig } from "../../core/config.ts"
import { migrate, openDatabase } from "../../database/orm.ts"
import { MODULES } from "../../modules/index.ts"
import { createAuth } from "../../services/auth/auth.ts"
import { SetupCode } from "../../services/auth/setup-code.ts"
import { createPublicFetcher } from "../../services/fetch/public-fetch.ts"
import { createSettings } from "../../services/settings/settings.ts"
import { LocalFileStore } from "../../services/storage/files.ts"
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
    const logger = pino({ level: "silent" })
    const auth = createAuth({ config, database, secret })
    const app = createApp({
      config,
      logger,
      database,
      auth,
      setupCode: new SetupCode(),
      settings: createSettings({
        database,
        logger,
        secret,
        definitions: MODULES.flatMap((module) => module.settings),
        fromEnv: config.fromEnv,
      }),
      modules: MODULES,
      // Describing the API never stores or fetches anything.
      files: new LocalFileStore(join(tmpdir(), "merran-openapi")),
      fetcher: createPublicFetcher({ version: config.version }),
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
