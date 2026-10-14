import * as React from "react"
import type {
  ChatConversation,
  ChatConversationDetail,
  ChatMessage,
  ChatPart,
  ChatStreamEvent,
  Proposal,
} from "@mise/shared"
import { useQueryClient } from "@tanstack/react-query"

import { api, ApiError } from "@/lib/api"

import { CHAT_KEY } from "./use-chat-queries"

/**
 * What's on screen, so "this recipe" or "this week" means something to the
 * assistant.
 */
export type ScreenContext =
  | { kind: "recipe"; recipeId: string; recipeName: string; scale: number }
  | { kind: "week"; weekStart: string; weekLabel: string }

/** Which thing is on screen; scaling a recipe is still the same recipe. */
const screenId = (screen: ScreenContext | null) =>
  !screen
    ? ""
    : screen.kind === "recipe"
      ? `recipe:${screen.recipeId}`
      : `week:${screen.weekStart}`

/** What a message was about, after "About": "Pancakes" or "the plan for Oct 12 – 18". */
export function screenLabel(screen: ScreenContext, withScale = false) {
  if (screen.kind === "week") return `the plan for ${screen.weekLabel}`
  return withScale && screen.scale !== 1
    ? `${screen.recipeName} (×${screen.scale})`
    : screen.recipeName
}

type ChatState = {
  open: boolean
  conversation: ChatConversation | null
  messages: ChatMessage[]
  proposals: Record<string, Proposal>
  streaming: boolean
  error: string | null
  /** What's typed in the message box, kept while the panel is closed. */
  draft: string
}

type ChatApi = ChatState & {
  setOpen(open: boolean): void
  setDraft(draft: string): void
  /** The recipe or week (or nothing) on screen, set by pages. */
  screen: ScreenContext | null
  setScreen(screen: ScreenContext | null): void
  /** Whether to send the screen along; reset when the screen changes. */
  useScreen: boolean
  setUseScreen(use: boolean): void
  send(message: string): Promise<void>
  stop(): void
  newChat(): void
  openConversation(id: string): Promise<void>
  updateProposal(proposal: Proposal): void
}

const ChatContext = React.createContext<ChatApi | null>(null)

const EMPTY: ChatState = {
  open: false,
  conversation: null,
  messages: [],
  proposals: {},
  streaming: false,
  error: null,
  draft: "",
}

/** Adds a streamed event to the reply being built. */
function addEvent(parts: ChatPart[], event: ChatStreamEvent): ChatPart[] {
  if (event.type === "text") {
    const last = parts.at(-1)
    return last?.type === "text"
      ? [...parts.slice(0, -1), { type: "text", text: last.text + event.delta }]
      : [...parts, { type: "text", text: event.delta }]
  }
  if (event.type === "tool") {
    const part: ChatPart = {
      type: "tool",
      id: event.id,
      label: event.label,
      status: event.status,
    }
    return parts.some((p) => p.type === "tool" && p.id === event.id)
      ? parts.map((p) => (p.type === "tool" && p.id === event.id ? part : p))
      : [...parts, part]
  }
  if (event.type === "proposal") {
    return [...parts, { type: "proposal", proposalId: event.proposal.id }]
  }
  return parts
}

/** Reads server-sent events from a fetch response. */
async function* readEvents(response: Response) {
  const reader = response.body!.pipeThrough(new TextDecoderStream()).getReader()
  let buffer = ""
  for (;;) {
    const { value, done } = await reader.read()
    if (done) return
    buffer += value
    let end
    while ((end = buffer.indexOf("\n\n")) !== -1) {
      const block = buffer.slice(0, end)
      buffer = buffer.slice(end + 2)
      const data = block
        .split("\n")
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trimStart())
        .join("\n")
      if (data) yield JSON.parse(data) as ChatStreamEvent
    }
  }
}

const STREAMING_ID = "streaming"

/** The assistant's state, shared by every chat button in the app. */
export function ChatProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient()
  const [state, setState] = React.useState<ChatState>(EMPTY)
  const [screen, setScreenState] = React.useState<ScreenContext | null>(null)
  const [useScreen, setUseScreen] = React.useState(true)
  const abortRef = React.useRef<AbortController | null>(null)

  const setScreen = React.useCallback((next: ScreenContext | null) => {
    setScreenState((current) => {
      if (screenId(current) !== screenId(next)) setUseScreen(true)
      return next
    })
  }, [])

  const send = React.useCallback(
    async (message: string) => {
      const text = message.trim()
      if (!text || abortRef.current) return
      const abort = new AbortController()
      abortRef.current = abort
      const shown = useScreen ? screen : null
      const context = !shown
        ? null
        : shown.kind === "recipe"
          ? { recipeId: shown.recipeId, scale: shown.scale }
          : { weekStart: shown.weekStart }
      const now = new Date().toISOString()
      setState((s) => ({
        ...s,
        streaming: true,
        error: null,
        draft: "",
        messages: [
          ...s.messages,
          {
            id: `pending-${now}`,
            role: "user",
            parts: [{ type: "text", text }],
            contextLabel: shown ? screenLabel(shown) : null,
            createdAt: now,
          },
          {
            id: STREAMING_ID,
            role: "assistant",
            parts: [],
            contextLabel: null,
            createdAt: now,
          },
        ],
      }))

      const fail = (error: string) =>
        setState((s) => ({
          ...s,
          streaming: false,
          error,
          // Put the message back so it can be sent again.
          draft: text,
          // The message wasn't saved: take it back out.
          messages: s.messages.filter(
            (m) => m.id !== STREAMING_ID && m.id !== `pending-${now}`
          ),
        }))

      try {
        const response = await fetch("/api/chat", {
          method: "POST",
          headers: { "content-type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({
            conversationId: state.conversation?.id,
            message: text,
            context,
          }),
          signal: abort.signal,
        })
        if (!response.ok) {
          const body = await response.json().catch(() => null)
          throw new ApiError(response.status, body)
        }
        for await (const event of readEvents(response)) {
          if (event.type === "conversation") {
            setState((s) => ({ ...s, conversation: event.conversation }))
          } else if (event.type === "error") {
            fail(event.message)
            return
          } else if (event.type === "done") {
            setState((s) => ({
              ...s,
              streaming: false,
              messages: s.messages.map((m) =>
                m.id === STREAMING_ID ? event.message : m
              ),
            }))
          } else {
            setState((s) => ({
              ...s,
              proposals:
                event.type === "proposal"
                  ? { ...s.proposals, [event.proposal.id]: event.proposal }
                  : s.proposals,
              messages: s.messages.map((m) =>
                m.id === STREAMING_ID
                  ? { ...m, parts: addEvent(m.parts, event) }
                  : m
              ),
            }))
          }
        }
      } catch (error) {
        if (abort.signal.aborted) {
          // Stopped: keep what arrived. The server saved it too.
          setState((s) => ({
            ...s,
            streaming: false,
            messages: s.messages.map((m) =>
              m.id === STREAMING_ID ? { ...m, id: `stopped-${now}` } : m
            ),
          }))
        } else {
          fail(
            error instanceof ApiError
              ? error.message
              : "Couldn't reach Mise. Check your connection."
          )
        }
      } finally {
        abortRef.current = null
        setState((s) => (s.streaming ? { ...s, streaming: false } : s))
        queryClient.invalidateQueries({ queryKey: CHAT_KEY })
      }
    },
    [queryClient, screen, useScreen, state.conversation?.id]
  )

  const stop = React.useCallback(() => abortRef.current?.abort(), [])

  const newChat = React.useCallback(() => {
    abortRef.current?.abort()
    setState((s) => ({ ...EMPTY, open: s.open, draft: s.draft }))
  }, [])

  const openConversation = React.useCallback(
    async (id: string) => {
      abortRef.current?.abort()
      const { conversation } = await queryClient.fetchQuery({
        queryKey: [...CHAT_KEY, "conversation", id],
        queryFn: () =>
          api<{ conversation: ChatConversationDetail }>(
            `/chat/conversations/${id}`
          ),
      })
      const { messages, proposals, ...rest } = conversation
      setState((s) => ({
        ...EMPTY,
        open: s.open,
        conversation: rest,
        messages,
        proposals,
      }))
    },
    [queryClient]
  )

  const updateProposal = React.useCallback((proposal: Proposal) => {
    setState((s) => ({
      ...s,
      proposals: { ...s.proposals, [proposal.id]: proposal },
    }))
  }, [])

  const value: ChatApi = {
    ...state,
    setOpen: (open) => setState((s) => ({ ...s, open })),
    setDraft: (draft) => setState((s) => ({ ...s, draft })),
    screen,
    setScreen,
    useScreen,
    setUseScreen,
    send,
    stop,
    newChat,
    openConversation,
    updateProposal,
  }
  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>
}

export function useChat() {
  const chat = React.useContext(ChatContext)
  if (!chat) throw new Error("useChat needs a ChatProvider")
  return chat
}

/** Tells the assistant what's on screen while this component is mounted. */
export function useChatScreen(screen: ScreenContext | null) {
  const { setScreen } = useChat()
  const key = JSON.stringify(screen)
  React.useEffect(() => {
    setScreen(screen)
    return () => setScreen(null)
    // The key covers every field of `screen`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, setScreen])
}
