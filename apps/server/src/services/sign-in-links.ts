import { randomBytes } from "node:crypto"

/** A sign-in link works this long, and once. */
const LINK_MS = 10 * 60_000

/**
 * One-time links that sign a browser in and go on to a page. An iPhone
 * Shortcut gets one with what it shared: iOS opens the link in a fresh
 * browser that has never signed in to Mise, and a new one each time, so a
 * saved login can't help. Only requests made with a Mise key get them, and
 * a key can do anything a sign-in can already.
 */
export function createSignInLinks() {
  const links = new Map<
    string,
    { userId: string; next: string; expires: number }
  >()

  function forget() {
    const now = Date.now()
    for (const [code, link] of links) if (link.expires < now) links.delete(code)
  }

  return {
    /** A code that signs `userId` in, then goes to `next` (a path in Mise). */
    create(userId: string, next: string) {
      if (!next.startsWith("/") || next.startsWith("//")) {
        throw new Error("A sign-in link only goes to a page in Mise")
      }
      forget()
      const code = randomBytes(32).toString("base64url")
      links.set(code, { userId, next, expires: Date.now() + LINK_MS })
      return code
    },

    /** Who the code signs in and where they go; null once used or expired. */
    redeem(code: string) {
      forget()
      const link = links.get(code)
      if (!link) return null
      links.delete(code)
      return { userId: link.userId, next: link.next }
    },
  }
}

export type SignInLinks = ReturnType<typeof createSignInLinks>
