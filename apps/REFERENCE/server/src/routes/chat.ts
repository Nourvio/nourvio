import { sendChatInput, type ChatConversationDetail } from "@mise/shared"
import { and, desc, eq } from "drizzle-orm"
import { Hono } from "hono"
import { streamSSE } from "hono/streaming"
import { z } from "zod"

import type { AiService } from "../ai/service.ts"
import { requireUser } from "../auth/middleware.ts"
import { prepareChat, toConversation, toMessage } from "../chat/agent.ts"
import { currentUser, type AppContext, type AppEnv } from "../context.ts"
import { fetchPublic } from "../import/safe-fetch.ts"
import { chatConversations, chatMessages } from "../db/schema.ts"
import { HttpError, readBody } from "../http.ts"
import { getProposals } from "../services/proposals.ts"

/** The assistant: send a message (streamed reply) and the person's conversations. */
export function chatRoutes(
  { db, fetcher = fetchPublic }: AppContext,
  ai: AiService
) {
  const app = new Hono<AppEnv>()
  app.use(requireUser)

  async function findConversation(userId: string, id: string) {
    const [row] = z.uuid().safeParse(id).success
      ? await db
          .select()
          .from(chatConversations)
          .where(
            and(
              eq(chatConversations.id, id),
              eq(chatConversations.userId, userId)
            )
          )
      : []
    if (!row) throw new HttpError(404, "That conversation doesn't exist")
    return row
  }

  /** Sends a message; the reply streams back as server-sent events. */
  app.post("/", async (c) => {
    const input = await readBody(c, sendChatInput)
    const run = await prepareChat({ db, ai, fetcher }, currentUser(c), input)
    c.header("Cache-Control", "no-cache, no-transform")
    c.header("X-Accel-Buffering", "no")
    return streamSSE(c, async (stream) => {
      const abort = new AbortController()
      stream.onAbort(() => abort.abort())
      await run(async (event) => {
        if (!stream.aborted)
          await stream.writeSSE({ data: JSON.stringify(event) })
      }, abort.signal)
    })
  })

  app.get("/conversations", async (c) => {
    const rows = await db
      .select()
      .from(chatConversations)
      .where(eq(chatConversations.userId, currentUser(c).id))
      .orderBy(desc(chatConversations.updatedAt))
      .limit(50)
    return c.json({ conversations: rows.map(toConversation) })
  })

  app.get("/conversations/:id", async (c) => {
    const user = currentUser(c)
    const row = await findConversation(user.id, c.req.param("id"))
    const messages = (
      await db
        .select()
        .from(chatMessages)
        .where(eq(chatMessages.conversationId, row.id))
        .orderBy(chatMessages.position)
    ).map(toMessage)
    const proposalIds = messages.flatMap((message) =>
      message.parts.flatMap((part) =>
        part.type === "proposal" ? [part.proposalId] : []
      )
    )
    const proposals = await getProposals(db, user.householdId, proposalIds)
    const detail: ChatConversationDetail = {
      ...toConversation(row),
      messages,
      proposals: Object.fromEntries(proposals.map((p) => [p.id, p])),
    }
    return c.json({ conversation: detail })
  })

  app.delete("/conversations/:id", async (c) => {
    const row = await findConversation(currentUser(c).id, c.req.param("id"))
    await db.delete(chatConversations).where(eq(chatConversations.id, row.id))
    return c.body(null, 204)
  })

  return app
}
