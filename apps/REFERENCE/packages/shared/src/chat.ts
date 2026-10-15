import { z } from "zod"

import type { AiProviderId } from "./ai.ts"
import { isoDate } from "./plan.ts"
import type { Proposal } from "./proposals.ts"

/**
 * What's on screen when a message is sent, so "this recipe" or "this week"
 * means something.
 */
export const chatContextSchema = z
  .object({
    recipeId: z.uuid().optional(),
    /** The servings multiplier the recipe is shown at. */
    scale: z.number().positive().max(100).optional(),
    /** The first day of the week the plan is showing. */
    weekStart: isoDate.optional(),
  })
  .nullable()
  .optional()
export type ChatContextInput = z.infer<typeof chatContextSchema>

export const sendChatInput = z.object({
  /** Leave out to start a new conversation. */
  conversationId: z.uuid().optional(),
  message: z
    .string()
    .trim()
    .min(1, "Type a message")
    .max(8000, "That message is too long"),
  context: chatContextSchema,
})
export type SendChatInput = z.infer<typeof sendChatInput>

/** A piece of a message, in the order it happened. */
export type ChatPart =
  | { type: "text"; text: string }
  | {
      type: "tool"
      id: string
      label: string
      status: "running" | "done" | "error"
    }
  | { type: "proposal"; proposalId: string }

export type ChatMessage = {
  id: string
  role: "user" | "assistant"
  parts: ChatPart[]
  /** The recipe the user was looking at, for a user message. */
  contextLabel: string | null
  createdAt: string
}

export type ChatConversation = {
  id: string
  title: string
  /** A conversation stays with the provider and model it started on. */
  provider: AiProviderId
  model: string
  createdAt: string
  updatedAt: string
}

export type ChatConversationDetail = ChatConversation & {
  messages: ChatMessage[]
  /** Every proposal the messages refer to, by id. */
  proposals: Record<string, Proposal>
}

/** Server-sent events while a reply streams in. */
export type ChatStreamEvent =
  | { type: "conversation"; conversation: ChatConversation }
  | { type: "text"; delta: string }
  | {
      type: "tool"
      id: string
      label: string
      status: "running" | "done" | "error"
    }
  | { type: "proposal"; proposal: Proposal }
  | { type: "done"; message: ChatMessage }
  | { type: "error"; message: string }
