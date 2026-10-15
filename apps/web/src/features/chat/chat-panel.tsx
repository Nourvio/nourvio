import * as React from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Add01Icon,
  AlertCircleIcon,
  ArrowLeft01Icon,
  ArrowUp02Icon,
  BubbleChatSparkIcon,
  Cancel01Icon,
  Delete02Icon,
  MessageMultiple01Icon,
  StopIcon,
  Tick02Icon,
} from "@hugeicons/core-free-icons"
import type { ChatMessage } from "@mise/shared"
import { Link } from "react-router"

import { Button } from "@/components/ui/button"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupTextarea,
} from "@/components/ui/input-group"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { useCurrentUser } from "@/features/auth/current-user"
import { formatRelativeDate } from "@/features/recipes/format"
import { useAiStatus } from "@/features/settings/use-ai"
import { cn } from "@/lib/utils"

import { screenLabel, useChat } from "./chat-provider"
import { Markdown } from "./markdown"
import { ProposalCard } from "./proposal-card"
import { useConversations, useDeleteConversation } from "./use-chat-queries"

const GENERAL = [
  "What should I make tonight?",
  "Something quick with chicken thighs",
  "A good banana bread recipe",
]

const FOR_RECIPE = [
  "What can I swap in this?",
  "Make this dairy-free",
  "Halve this recipe",
  "What goes well with this?",
]

const FOR_WEEK = [
  "Fill in the dinners I haven't planned",
  "Quick dinners for the weeknights",
  "Something I haven't made in a while",
  "What else should I pick up this week?",
]

/** The assistant: a conversation, or the list of past ones. */
export function ChatPanel({
  Title,
}: {
  /** The drawer's or sheet's title component, for accessibility. */
  Title: React.ComponentType<{ className?: string; children: React.ReactNode }>
}) {
  const chat = useChat()
  const ai = useAiStatus()
  const [view, setView] = React.useState<"chat" | "history">("chat")

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-1 border-b px-3 py-2">
        {view === "history" ? (
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Back to the conversation"
            onClick={() => setView("chat")}
          >
            <HugeiconsIcon icon={ArrowLeft01Icon} strokeWidth={2} />
          </Button>
        ) : null}
        <Title className="min-w-0 flex-1 truncate px-1 text-base font-semibold">
          {view === "history"
            ? "Conversations"
            : (chat.conversation?.title ?? "Assistant")}
        </Title>
        {view === "chat" && (
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Past conversations"
            onClick={() => setView("history")}
          >
            <HugeiconsIcon icon={MessageMultiple01Icon} strokeWidth={2} />
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="New conversation"
          disabled={!chat.messages.length && view === "chat"}
          onClick={() => {
            chat.newChat()
            setView("chat")
          }}
        >
          <HugeiconsIcon icon={Add01Icon} strokeWidth={2} />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Close the assistant"
          onClick={() => chat.setOpen(false)}
        >
          <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} />
        </Button>
      </div>

      {ai.data && !ai.data.available ? (
        <NeedsAi />
      ) : view === "history" ? (
        <ConversationList onPick={() => setView("chat")} />
      ) : (
        <>
          {chat.messages.length ? <MessageList /> : <Welcome />}
          <Composer />
        </>
      )}
    </div>
  )
}

function NeedsAi() {
  const me = useCurrentUser()
  return (
    <Empty className="flex-1">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <HugeiconsIcon icon={BubbleChatSparkIcon} strokeWidth={2} />
        </EmptyMedia>
        <EmptyTitle>The assistant needs AI</EmptyTitle>
        <EmptyDescription>
          {me.isServerAdmin
            ? "Add a Claude or OpenAI key in Settings to start chatting."
            : "Ask whoever runs this Nourvio to add a Claude or OpenAI key in Settings."}
        </EmptyDescription>
      </EmptyHeader>
      {me.isServerAdmin && (
        <EmptyContent>
          <Button asChild>
            <Link to="/settings">Set up AI</Link>
          </Button>
        </EmptyContent>
      )}
    </Empty>
  )
}

function Welcome() {
  const chat = useChat()
  const screen = chat.useScreen ? chat.screen : null
  return (
    <Empty className="flex-1">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <HugeiconsIcon icon={BubbleChatSparkIcon} strokeWidth={2} />
        </EmptyMedia>
        <EmptyTitle>
          {screen?.kind === "recipe"
            ? `Ask about ${screen.recipeName}`
            : screen?.kind === "week"
              ? "Plan the week together"
              : "What's cooking?"}
        </EmptyTitle>
        <EmptyDescription>
          {screen?.kind === "week"
            ? "Ask for ideas for the empty meals, or what to buy. Anything worth keeping comes with a button to add it."
            : "Ask for ideas, swap an ingredient, or work out a new recipe. Anything worth keeping comes with a button to save it."}
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <div className="flex flex-wrap justify-center gap-2">
          {(screen?.kind === "recipe"
            ? FOR_RECIPE
            : screen?.kind === "week"
              ? FOR_WEEK
              : GENERAL
          ).map((suggestion) => (
            <Button
              key={suggestion}
              variant="outline"
              size="sm"
              className="h-auto rounded-full py-1.5 whitespace-normal"
              onClick={() => chat.send(suggestion)}
            >
              {suggestion}
            </Button>
          ))}
        </div>
      </EmptyContent>
    </Empty>
  )
}

function MessageList() {
  const chat = useChat()
  const end = React.useRef<HTMLDivElement>(null)
  const scroller = React.useRef<HTMLDivElement>(null)
  const last = chat.messages.at(-1)
  const lastSize = last ? JSON.stringify(last.parts).length : 0

  // Follow the reply as it streams, unless they've scrolled up to read.
  React.useEffect(() => {
    const box = scroller.current
    if (!box) return
    const nearBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 160
    if (nearBottom || chat.streaming)
      end.current?.scrollIntoView({ block: "end" })
  }, [chat.messages.length, lastSize, chat.streaming])

  return (
    <div
      ref={scroller}
      className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4"
    >
      {/* grid-cols-1 is minmax(0, 1fr): long content wraps instead of widening the panel. */}
      <div className="grid grid-cols-1 gap-5">
        {chat.messages.map((message) =>
          message.role === "user" ? (
            <UserMessage key={message.id} message={message} />
          ) : (
            <AssistantMessage key={message.id} message={message} />
          )
        )}
      </div>
      <div ref={end} />
    </div>
  )
}

function UserMessage({ message }: { message: ChatMessage }) {
  const text = message.parts
    .flatMap((p) => (p.type === "text" ? [p.text] : []))
    .join("\n")
  return (
    <div className="grid justify-items-end gap-1">
      {message.contextLabel && (
        <span className="text-xs text-muted-foreground">
          About {message.contextLabel}
        </span>
      )}
      <div className="max-w-[85%] rounded-2xl rounded-br-md bg-primary px-3.5 py-2 whitespace-pre-wrap text-primary-foreground">
        {text}
      </div>
    </div>
  )
}

function AssistantMessage({ message }: { message: ChatMessage }) {
  const chat = useChat()
  const live = message.id === "streaming"
  return (
    <div className="grid min-w-0 grid-cols-1 gap-3">
      {message.parts.map((part, index) => {
        if (part.type === "text") {
          return <Markdown key={index}>{part.text}</Markdown>
        }
        if (part.type === "tool") {
          return (
            <div
              key={part.id}
              className="flex items-center gap-2 text-xs text-muted-foreground"
            >
              {part.status === "running" ? (
                <Spinner className="size-3.5" />
              ) : (
                <HugeiconsIcon
                  icon={part.status === "error" ? AlertCircleIcon : Tick02Icon}
                  strokeWidth={2}
                  className="size-3.5"
                />
              )}
              {part.label}
            </div>
          )
        }
        const proposal = chat.proposals[part.proposalId]
        return proposal ? (
          <ProposalCard key={part.proposalId} proposal={proposal} />
        ) : null
      })}
      {live && isWaiting(message) && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Spinner className="size-4" />
          Thinking…
        </div>
      )}
    </div>
  )
}

/** Nothing visibly happening: before the first words, or between steps. */
function isWaiting(message: ChatMessage) {
  const last = message.parts.at(-1)
  return (
    !last ||
    last.type === "proposal" ||
    (last.type === "tool" && last.status !== "running")
  )
}

function Composer() {
  const chat = useChat()
  const text = chat.draft

  function submit() {
    if (!text.trim() || chat.streaming) return
    void chat.send(text)
  }

  return (
    <div className="grid gap-2 border-t p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
      {chat.error && (
        <p className="flex items-start gap-2 text-sm text-destructive">
          <HugeiconsIcon
            icon={AlertCircleIcon}
            strokeWidth={2}
            className="mt-0.5 size-4 shrink-0"
          />
          {chat.error}
        </p>
      )}
      {chat.screen && chat.useScreen && (
        <div className="flex w-fit max-w-full items-center gap-1 rounded-full bg-muted py-0.5 pr-1 pl-3 text-xs text-muted-foreground">
          <span className="truncate">
            About {screenLabel(chat.screen, true)}
          </span>
          <Button
            variant="ghost"
            size="icon-xs"
            className="size-5 rounded-full"
            aria-label={
              chat.screen.kind === "recipe"
                ? "Don't send this recipe with my message"
                : "Don't send this week's plan with my message"
            }
            onClick={() => chat.setUseScreen(false)}
          >
            <HugeiconsIcon
              icon={Cancel01Icon}
              strokeWidth={2}
              className="size-3"
            />
          </Button>
        </div>
      )}
      <form
        onSubmit={(event) => {
          event.preventDefault()
          submit()
        }}
      >
        <InputGroup>
          <InputGroupTextarea
            rows={1}
            value={text}
            enterKeyHint="send"
            placeholder="Ask anything about cooking"
            aria-label="Message"
            className="[field-sizing:content] max-h-40 min-h-11"
            onChange={(event) => chat.setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (
                event.key === "Enter" &&
                !event.shiftKey &&
                !event.nativeEvent.isComposing
              ) {
                event.preventDefault()
                submit()
              }
            }}
          />
          <InputGroupAddon align="block-end">
            {chat.streaming ? (
              <InputGroupButton
                type="button"
                size="icon-sm"
                variant="secondary"
                className="ml-auto rounded-full"
                aria-label="Stop"
                onClick={chat.stop}
              >
                <HugeiconsIcon icon={StopIcon} strokeWidth={2} />
              </InputGroupButton>
            ) : (
              <InputGroupButton
                type="submit"
                size="icon-sm"
                variant="default"
                className="ml-auto rounded-full"
                aria-label="Send"
                disabled={!text.trim()}
              >
                <HugeiconsIcon icon={ArrowUp02Icon} strokeWidth={2} />
              </InputGroupButton>
            )}
          </InputGroupAddon>
        </InputGroup>
      </form>
    </div>
  )
}

function ConversationList({ onPick }: { onPick: () => void }) {
  const chat = useChat()
  const conversations = useConversations(true)
  const remove = useDeleteConversation()

  if (conversations.isPending) {
    return (
      <div className="grid gap-2 p-4">
        <Skeleton className="h-12" />
        <Skeleton className="h-12" />
      </div>
    )
  }
  if (!conversations.data?.length) {
    return (
      <Empty className="flex-1">
        <EmptyHeader>
          <EmptyTitle>No conversations yet</EmptyTitle>
          <EmptyDescription>
            They'll show up here, newest first.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }
  return (
    <ul className="min-h-0 flex-1 overflow-y-auto p-2">
      {conversations.data.map((conversation) => (
        <li key={conversation.id} className="group flex items-center gap-1">
          <button
            type="button"
            className={cn(
              "grid min-w-0 flex-1 gap-0.5 rounded-xl px-3 py-2.5 text-left hover:bg-muted",
              conversation.id === chat.conversation?.id && "bg-muted"
            )}
            onClick={() => {
              void chat.openConversation(conversation.id)
              onPick()
            }}
          >
            <span className="truncate text-sm font-medium">
              {conversation.title}
            </span>
            <span className="text-xs text-muted-foreground">
              {formatRelativeDate(conversation.updatedAt)}
            </span>
          </button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Delete "${conversation.title}"`}
            disabled={remove.isPending}
            onClick={() =>
              remove.mutate(conversation.id, {
                onSuccess: () => {
                  if (conversation.id === chat.conversation?.id) chat.newChat()
                },
              })
            }
          >
            <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} />
          </Button>
        </li>
      ))}
    </ul>
  )
}
