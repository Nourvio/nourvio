import { randomInt, timingSafeEqual } from "node:crypto"

// No 0/O, 1/I/L or 5/S, so the code is easy to read out of a log.
const ALPHABET = "ABCDEFGHJKMNPQRTUVWXYZ2346789"

function normalize(code: string) {
  return code.toUpperCase().replace(/[^A-Z0-9]/g, "")
}

/**
 * The one-time code for creating the first account. It lives only in memory
 * and changes on every restart until setup is done.
 */
export class SetupCode {
  #code: string | null = null

  issue() {
    const chars = Array.from(
      { length: 12 },
      () => ALPHABET[randomInt(ALPHABET.length)]
    ).join("")
    this.#code = chars
    return `${chars.slice(0, 4)}-${chars.slice(4, 8)}-${chars.slice(8)}`
  }

  matches(input: string) {
    if (!this.#code) return false
    const given = Buffer.from(normalize(input))
    const expected = Buffer.from(this.#code)
    return given.length === expected.length && timingSafeEqual(given, expected)
  }

  clear() {
    this.#code = null
  }
}
