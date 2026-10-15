import type { Context } from "hono"

import { config } from "../config.ts"
import { currentUser, type AppEnv } from "../context.ts"
import type { ReceiptFiles } from "../services/receipts.ts"
import type { SignInLinks } from "../services/sign-in-links.ts"

/** Nourvio's own address, for links a Shortcut opens. */
export function publicOrigin(c: Context<AppEnv>) {
  if (config.publicUrl) return new URL(config.publicUrl).origin
  const proto =
    c.req.header("x-forwarded-proto")?.split(",")[0]?.trim() ??
    new URL(c.req.url).protocol.replace(":", "")
  const host =
    c.req.header("x-forwarded-host")?.split(",")[0]?.trim() ??
    c.req.header("host") ??
    new URL(c.req.url).host
  return `${proto}://${host}`
}

/**
 * The link to open after a share. Sent with a Nourvio key (an iPhone
 * Shortcut), it signs in first: iOS opens it in a browser that isn't signed
 * in to Nourvio, and a fresh one each time.
 */
export function openLink(
  c: Context<AppEnv>,
  signInLinks: SignInLinks,
  path: string
) {
  const origin = publicOrigin(c)
  if (!c.get("viaToken")) return `${origin}${path}`
  return `${origin}/s/${signInLinks.create(currentUser(c).id, path)}`
}

/**
 * What was sent, however it came: a form with files and text (Nourvio, a
 * Shortcut, Android's share sheet), JSON with `text` (and `url`), or a file
 * as the whole body, as some Shortcuts send it.
 */
export async function readUpload(c: Context<AppEnv>) {
  const type = c.req.header("content-type") ?? ""
  const files: ReceiptFiles = []
  const texts: string[] = []
  if (type.startsWith("application/json")) {
    const body = (await c.req.json().catch(() => ({}))) as Record<
      string,
      unknown
    >
    for (const key of ["text", "url"]) {
      const value = body[key]
      if (typeof value === "string" && value.trim()) texts.push(value)
    }
  } else if (
    type.startsWith("multipart/form-data") ||
    type.startsWith("application/x-www-form-urlencoded")
  ) {
    const body = await c.req.parseBody({ all: true })
    for (const value of [body.file, body.files, body.text, body.url].flat()) {
      if (value instanceof File) {
        files.push({
          buffer: Buffer.from(await value.arrayBuffer()),
          type: value.type,
        })
      } else if (typeof value === "string" && value.trim()) {
        texts.push(value)
      }
    }
  } else {
    const buffer = Buffer.from(await c.req.arrayBuffer())
    if (type.startsWith("text/")) {
      const text = buffer.toString("utf8")
      if (text.trim()) texts.push(text)
    } else if (buffer.length) {
      files.push({ buffer, type })
    }
  }
  return { files, text: texts.join("\n\n").trim() || null }
}
