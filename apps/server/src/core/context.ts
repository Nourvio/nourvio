import type { EntityManager } from "@mikro-orm/sql"
import type { Logger } from "pino"
import type { Database } from "../database/orm.ts"
import type { Module } from "../modules/module.ts"
import type { ApiAccess, ApiArea } from "../services/auth/api-keys.ts"
import type { Auth } from "../services/auth/auth.ts"
import type { Authenticated } from "../services/auth/session.ts"
import type { SetupCode } from "../services/auth/setup-code.ts"
import type { EventBus } from "../services/events/events.ts"
import type { Fetcher } from "../services/fetch/public-fetch.ts"
import type { JobRunner } from "../services/jobs/runner.ts"
import type { Settings } from "../services/settings/settings.ts"
import type { FileStore } from "../services/storage/files.ts"
import type { Config } from "./config.ts"

/** What the app is built from. Tests pass their own. */
export type AppDeps = {
  config: Config
  logger: Logger
  database: Database
  auth: Auth
  setupCode: SetupCode
  /** Every setting's value, and saving them. */
  settings: Settings
  /** Merran's optional parts (modules/index.ts). Tests can pass their own. */
  modules: readonly Module[]
  /** Where files like photos are kept. */
  files: FileStore
  /** The one way to fetch from the internet: public addresses only. Tests pass a fake. */
  fetcher: Fetcher
  /** Runs background work; routes stop jobs through it. */
  jobs: JobRunner
  /** What changed in each household, for live updates. */
  events: EventBus
}

/** Variables set on every request. `requestId` comes from Hono's middleware. */
export type AppEnv = {
  Variables: {
    /** The app's logger, tagged with this request's id. */
    logger: Logger
    /**
     * This request's own entity manager. It sees no household's rows until
     * scoped, which `inHousehold()` does.
     */
    em: EntityManager
    /** Who sent the request, if anyone. Routes require it with the guards in http/middleware/auth.ts. */
    user: Authenticated["user"] | null
    /** Their session, when they signed in rather than using an API key. */
    session: Authenticated["session"]
    /** The household they're using. */
    household: Authenticated["household"]
    /** The API key they used, if any. */
    apiKey: Authenticated["apiKey"]
    /** The permission that lets an API key use this route, set by `openToKeys()`. */
    keyPermission?: { area: ApiArea; access: ApiAccess }
  }
}
