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
  listPendingProposals,
} from "../services/cleanup.ts"

/** AI suggestions waiting for review: list, apply (chosen sections) or dismiss. */
export function proposalsRoutes({ db }: AppContext) {
  const app = new Hono<AppEnv>()
  app.use(requireUser)

  app.get("/", async (c) =>
    c.json({ proposals: await listPendingProposals(db, currentHousehold(c)) })
  )

  app.post("/:id/apply", async (c) => {
    const { sections } = await readBody(c, applyProposalInput)
    const recipe = await applyProposal(
      db,
      currentHousehold(c),
      c.req.param("id"),
      sections,
      currentUser(c).id
    )
    return c.json({ recipe })
  })

  app.post("/:id/dismiss", async (c) => {
    await dismissProposal(db, currentHousehold(c), c.req.param("id"))
    return c.body(null, 204)
  })

  return app
}
