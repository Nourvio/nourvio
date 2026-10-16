import type { EntityManager } from "@mikro-orm/sql"
import type { Logger } from "pino"
import type { Database } from "../database/orm.ts"
import type { Auth } from "../services/auth/auth.ts"
import type { Authenticated } from "../services/auth/session.ts"
import type { SetupCode } from "../services/auth/setup-code.ts"
import type { Config } from "./config.ts"

/** What the app is built from. Tests pass their own. */
export type AppDeps = {
  config: Config
  logger: Logger
  database: Database
  auth: Auth
  setupCode: SetupCode
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
    /** Who's signed in, if anyone. Routes use `signedIn()` to require it. */
    user: Authenticated["user"] | null
    session: Authenticated["session"] | null
    /** The household they're using. Routes use `inHousehold()` to require it. */
    household: Authenticated["household"]
  }
}
