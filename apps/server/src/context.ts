import type { Context } from "hono"

import type { AiProviderFactory } from "./ai/types.ts"
import type { SetupCode } from "./auth/setup-code.ts"
import type { Db } from "./db/client.ts"
import { HttpError } from "./http.ts"
import type { MealieFetch } from "./import/mealie.ts"
import type { Fetcher } from "./import/safe-fetch.ts"
import type { VideoTools } from "./import/video-tools.ts"
import type { UserRow } from "./services/users.ts"
import type { FdcClientFactory } from "./nutrition/fdc.ts"

/** What the app needs to run. Tests pass an in-memory database here. */
export type AppContext = {
  db: Db
  setupCode: SetupCode
  /** How imports fetch web pages. Tests swap in a fake; defaults to fetchPublic. */
  fetcher?: Fetcher
  /** How AI providers are built. Tests swap in a fake; defaults to the real SDKs. */
  aiFactory?: AiProviderFactory
  /** yt-dlp and ffmpeg for video links. Tests swap in a fake. */
  videoTools?: VideoTools
  /** How the Mealie importer reaches Mealie. Tests swap in a fake. */
  mealieFetch?: MealieFetch
  /** How USDA FoodData Central is reached. Tests swap in a fake. */
  fdcFactory?: FdcClientFactory
  /** Work out nutrition in the background after a recipe is saved. On unless turned off (tests). */
  autoNutrition?: boolean
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

/** The signed-in user's household: everything they see and change is in it. */
export function currentHousehold(c: Context<AppEnv>) {
  return currentUser(c).householdId
}
