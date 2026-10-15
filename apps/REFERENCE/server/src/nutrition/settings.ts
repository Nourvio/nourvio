import type { NutritionSettings } from "@mise/shared"
import { eq } from "drizzle-orm"

import type { Db } from "../db/client.ts"
import { settings } from "../db/schema.ts"
import { decryptSecret, encryptSecret } from "../secrets.ts"

const SETTINGS_KEY = "nutrition"
const ENV_KEY = "USDA_API_KEY"

type Stored = { usdaKey?: string }

async function load(db: Db): Promise<Stored> {
  const [row] = await db
    .select({ value: settings.value })
    .from(settings)
    .where(eq(settings.key, SETTINGS_KEY))
  return (row?.value as Stored | undefined) ?? {}
}

/** The USDA key to use: the server environment's, else the one saved in Settings. */
export async function usdaKey(
  db: Db
): Promise<{ key: string; source: "env" | "settings" } | null> {
  const fromEnv = process.env[ENV_KEY]?.trim()
  if (fromEnv) return { key: fromEnv, source: "env" }
  const saved = (await load(db)).usdaKey
  const key = saved ? decryptSecret(saved) : null
  return key ? { key, source: "settings" } : null
}

export async function getNutritionSettings(db: Db): Promise<NutritionSettings> {
  const found = await usdaKey(db)
  return {
    usdaKey: {
      configured: Boolean(found),
      source: found?.source ?? null,
      hint: found ? `…${found.key.slice(-4)}` : null,
    },
  }
}

/** Saves (or with null, removes) the USDA key. */
export async function saveUsdaKey(db: Db, key: string | null) {
  const value: Stored = key ? { usdaKey: encryptSecret(key) } : {}
  await db
    .insert(settings)
    .values({ key: SETTINGS_KEY, value })
    .onConflictDoUpdate({ target: settings.key, set: { value } })
}
