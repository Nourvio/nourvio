import { addReceiptInput, receiptTextInput } from "@mise/shared"
import { Hono, type Context } from "hono"
import { bodyLimit } from "hono/body-limit"

import { requireUser } from "../auth/middleware.ts"
import { config } from "../config.ts"
import { currentHousehold, currentUser, type AppEnv } from "../context.ts"
import { readBody } from "../http.ts"
import type { EventBus } from "../services/events.ts"
import type { ReceiptFiles, ReceiptService } from "../services/receipts.ts"

/** Photos, screenshots and PDFs of a receipt, together. */
const MAX_UPLOAD = 40 * 1024 * 1024

/** Mise's own address, for the link a Shortcut opens. */
function origin(c: Context<AppEnv>) {
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
 * Receipts into the pantry: read one (from Mise, or shared from an iPhone
 * Shortcut with a key), look it over, then add what was bought.
 */
export function receiptRoutes(receipts: ReceiptService, events: EventBus) {
  const app = new Hono<AppEnv>()
  app.use(requireUser)

  app.post(
    "/",
    bodyLimit({
      maxSize: MAX_UPLOAD,
      onError: (c) => c.json({ error: "That receipt is too large" }, 413),
    }),
    async (c) => {
      const type = c.req.header("content-type") ?? ""
      const files: ReceiptFiles = []
      const texts: string[] = []
      if (type.startsWith("application/json")) {
        texts.push((await readBody(c, receiptTextInput)).text)
      } else if (
        type.startsWith("multipart/form-data") ||
        type.startsWith("application/x-www-form-urlencoded")
      ) {
        const body = await c.req.parseBody({ all: true })
        const values = [body.file, body.files, body.text].flat()
        for (const value of values) {
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
        // A file sent as the whole body, as some Shortcuts do.
        const buffer = Buffer.from(await c.req.arrayBuffer())
        if (buffer.length) files.push({ buffer, type })
      }
      const draft = await receipts.read(
        { userId: currentUser(c).id, householdId: currentHousehold(c) },
        { files, text: texts.join("\n\n") || null }
      )
      return c.json(
        { draft, url: `${origin(c)}/pantry/receipt?id=${draft.id}` },
        201
      )
    }
  )

  app.get("/:id", (c) =>
    c.json({ draft: receipts.get(currentHousehold(c), c.req.param("id")) })
  )

  app.post("/:id/add", async (c) => {
    const input = await readBody(c, addReceiptInput)
    const user = currentUser(c)
    const result = await receipts.add(
      user.householdId,
      c.req.param("id"),
      input
    )
    if (result.offTheList) {
      events.publish(user.householdId, { type: "list", by: user.id })
    }
    return c.json(result)
  })

  return app
}
