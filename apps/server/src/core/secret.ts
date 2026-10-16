import { randomBytes } from "node:crypto"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import type { Config } from "./config.ts"

/**
 * The server's secret: MERRAN_SECRET, or one made on first start and kept in
 * the data folder. Losing it signs everyone out, so it's backed up with the
 * data folder.
 */
export function loadSecret(config: Pick<Config, "secret" | "dataDir">): string {
  if (config.secret) return config.secret

  const file = join(config.dataDir, "secret")
  if (existsSync(file)) return readFileSync(file, "utf8").trim()

  mkdirSync(config.dataDir, { recursive: true })
  const secret = randomBytes(32).toString("hex")
  writeFileSync(file, secret, { mode: 0o600 })
  return secret
}
