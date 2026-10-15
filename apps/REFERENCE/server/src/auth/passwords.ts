import {
  randomBytes,
  scrypt,
  timingSafeEqual,
  type ScryptOptions,
} from "node:crypto"

// scrypt with N=2^15, r=8, p=1: about 32 MB and well under 100 ms per hash.
const COST = { N: 2 ** 15, r: 8, p: 1 }
const KEY_LENGTH = 32
const MAX_MEMORY = 128 * 1024 * 1024

function derive(
  password: string,
  salt: Buffer,
  length: number,
  options: ScryptOptions
) {
  return new Promise<Buffer>((resolve, reject) => {
    scrypt(
      password.normalize("NFKC"),
      salt,
      length,
      { ...options, maxmem: MAX_MEMORY },
      (error, key) => (error ? reject(error) : resolve(key))
    )
  })
}

/** Returns `scrypt$N$r$p$salt$hash`, with the salt and hash in base64. */
export async function hashPassword(password: string) {
  const salt = randomBytes(16)
  const hash = await derive(password, salt, KEY_LENGTH, COST)
  return [
    "scrypt",
    COST.N,
    COST.r,
    COST.p,
    salt.toString("base64"),
    hash.toString("base64"),
  ].join("$")
}

export async function verifyPassword(password: string, stored: string) {
  const [algorithm, N, r, p, salt, hash] = stored.split("$")
  if (algorithm !== "scrypt" || !salt || !hash) return false
  const expected = Buffer.from(hash, "base64")
  const actual = await derive(
    password,
    Buffer.from(salt, "base64"),
    expected.length,
    { N: Number(N), r: Number(r), p: Number(p) }
  )
  return timingSafeEqual(actual, expected)
}

let dummyHash: Promise<string> | undefined

/**
 * Checks a password against a throwaway hash, so a login for an unknown
 * username takes as long as one for a real username.
 */
export async function verifyAgainstDummy(password: string) {
  dummyHash ??= hashPassword("not a real password")
  await verifyPassword(password, await dummyHash)
}
