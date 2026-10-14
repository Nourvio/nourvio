import { applyProposalInput } from "@mise/shared"
import { Hono } from "hono"

import { requireUser } from "../auth/middleware.ts"
import {
  currentHousehold,
  currentUser,
  type AppContext,
  type AppEnv,
} from "../context.ts"
import { readBody } from "../http.ts"
import {
  applyProposal,
  dismissProposal,
  listPendingCleanups,
} from "../services/proposals.ts"

/**
 * AI suggestions: the Review page's tidy-ups, and applying or dismissing any
 * proposal (tidy-ups, and chat's edits and new recipes).
 */
export function proposalsRoutes({ db }: AppContext) {
  const app = new Hono<AppEnv>()
  app.use(requireUser)

  app.get("/", async (c) =>
    c.json({ proposals: await listPendingCleanups(db, currentHousehold(c)) })
  )

  app.post("/:id/apply", async (c) => {
    const input = await readBody(c, applyProposalInput)
    return c.json(
      await applyProposal(
        db,
        currentHousehold(c),
        c.req.param("id"),
        input,
        currentUser(c).id
      )
    )
  })

  app.post("/:id/dismiss", async (c) =>
    c.json({
      proposal: await dismissProposal(
        db,
        currentHousehold(c),
        c.req.param("id")
      ),
    })
  )

  return app
}
