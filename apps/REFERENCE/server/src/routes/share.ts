import { Hono } from "hono"
import { bodyLimit } from "hono/body-limit"

import { requireUser } from "../auth/middleware.ts"
import { currentHousehold, currentUser, type AppEnv } from "../context.ts"
import type { ImportBatchService } from "../services/import-batches.ts"
import { linksIn, type ShareService } from "../services/share.ts"
import type { SignInLinks } from "../services/sign-in-links.ts"
import { openLink, readUpload } from "./uploads.ts"

/** Photos, screenshots and PDFs, together. */
const MAX_UPLOAD = 40 * 1024 * 1024
/** Links imported from one share, as a bulk import allows. */
const MAX_LINKS = 100

/**
 * Sharing anything into Nourvio, from an iPhone Shortcut (with a key) or
 * Android: hand it over, then open the link that comes back.
 */
export function shareRoutes(
  share: ShareService,
  signInLinks: SignInLinks,
  batches: ImportBatchService
) {
  const app = new Hono<AppEnv>()
  app.use(requireUser)

  /** Takes what was shared and says where to open it; quick, so a Shortcut doesn't wait. */
  app.post(
    "/",
    bodyLimit({
      maxSize: MAX_UPLOAD,
      onError: (c) => c.json({ error: "That's too large to share" }, 413),
    }),
    async (c) => {
      const shared = await readUpload(c)
      if (!shared.files.length && !shared.text) {
        return c.json({ error: "Nothing came through to share" }, 400)
      }
      // A link needs nothing kept: the page imports it. Several start
      // importing now, and the page follows along.
      const links = linksIn(shared)
      let path: string
      if (links.length > 1) {
        const batch = await batches.start(
          { userId: currentUser(c).id, householdId: currentHousehold(c) },
          { urls: links.slice(0, MAX_LINKS) }
        )
        path = `/recipes/import/${batch.id}`
      } else if (links.length) {
        path = `/share?link=${encodeURIComponent(links[0]!)}`
      } else {
        path = `/share?inbox=${share.keep(currentHousehold(c), shared)}`
      }
      return c.json({ url: openLink(c, signInLinks, path) }, 201)
    }
  )

  /** Works out what was shared and deals with it: a receipt, a recipe, or a link. */
  app.post("/:id", async (c) =>
    c.json({
      result: await share.open(
        { userId: currentUser(c).id, householdId: currentHousehold(c) },
        c.req.param("id")
      ),
    })
  )

  return app
}
