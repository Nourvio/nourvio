import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto"
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import { config } from "./config.ts"

let cachedKey: Buffer | undefined

/**
 * The key that encrypts API keys saved in the database. It comes from
 * MISE_SECRET if set, otherwise from DATA_DIR/secret, which is created on
 * first use. A database dump alone isn't enough to read the API keys.
 */
function secretKey() {
  if (cachedKey) return cachedKey
  const fromEnv = process.env.MISE_SECRET
  if (fromEnv) {
    cachedKey = createHash("sha256").update(fromEnv).digest()
    return cachedKey
  }
  const file = join(config.dataDir, "secret")
  let secret: string
  try {
    secret = readFileSync(file, "utf8").trim()
  } catch {
    secret = randomBytes(32).toString("hex")
    mkdirSync(config.dataDir, { recursive: true })
    writeFileSync(file, `${secret}\n`, { mode: 0o600, flag: "wx" })
  }
  cachedKey = createHash("sha256").update(secret).digest()
  return cachedKey
}

/** AES-256-GCM. Returns "v1.<iv>.<tag>.<ciphertext>", base64url parts. */
export function encryptSecret(plain: string) {
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", secretKey(), iv)
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()])
  return ["v1", iv, cipher.getAuthTag(), data]
    .map((part) =>
      typeof part === "string" ? part : part.toString("base64url")
    )
    .join(".")
}

/** Null if the value can't be decrypted, for example after the secret changed. */
export function decryptSecret(sealed: string) {
  const [version, iv, tag, data] = sealed.split(".")
  if (version !== "v1" || !iv || !tag || !data) return null
  try {
    const decipher = createDecipheriv(
      "aes-256-gcm",
      secretKey(),
      Buffer.from(iv, "base64url")
    )
    decipher.setAuthTag(Buffer.from(tag, "base64url"))
    return Buffer.concat([
      decipher.update(Buffer.from(data, "base64url")),
      decipher.final(),
    ]).toString("utf8")
  } catch {
    return null
  }
}
