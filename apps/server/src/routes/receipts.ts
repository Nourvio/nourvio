import { addReceiptInput } from "@mise/shared"
import { Hono } from "hono"
import { bodyLimit } from "hono/body-limit"

import { requireUser } from "../auth/middleware.ts"
import { currentHousehold, currentUser, type AppEnv } from "../context.ts"
import { readBody } from "../http.ts"
import type { EventBus } from "../services/events.ts"
import type { ReceiptService } from "../services/receipts.ts"
import { publicOrigin, readUpload } from "./uploads.ts"

/** Photos, screenshots and PDFs of a receipt, together. */
const MAX_UPLOAD = 40 * 1024 * 1024

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
      const { files, text } = await readUpload(c)
      const { draft } = await receipts.read(
        { userId: currentUser(c).id, householdId: currentHousehold(c) },
        { files, text }
      )
      return c.json(
        { draft, url: `${publicOrigin(c)}/pantry/receipt?id=${draft.id}` },
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
