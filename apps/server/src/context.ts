import type { Context } from "hono"

import type { SetupCode } from "./auth/setup-code.ts"
import type { Db } from "./db/client.ts"
import { HttpError } from "./http.ts"
import type { Fetcher } from "./import/safe-fetch.ts"
import type { UserRow } from "./services/users.ts"

/** What the app needs to run. Tests pass an in-memory database here. */
export type AppContext = {
  db: Db
  setupCode: SetupCode
  /** How imports fetch web pages. Tests swap in a fake; defaults to fetchPublic. */
  fetcher?: Fetcher
}

export type AppEnv = {
  Variables: {
    user: UserRow | undefined
    sessionId: string | undefined
  }
}

/** The signed-in user. Only call this behind `requireUser`. */
export function currentUser(c: Context<AppEnv>) {
  const user = c.get("user")
  if (!user) throw new HttpError(401, "Sign in to continue")
  return user
}
