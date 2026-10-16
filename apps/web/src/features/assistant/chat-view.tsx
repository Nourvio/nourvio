import {
  ArrowUp02Icon,
  Cancel01Icon,
  Camera01Icon,
  CheckmarkCircle02Icon,
  ImageAdd01Icon,
  StopIcon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useChat } from "@ai-sdk/react"
import { useQueryClient } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import { DefaultChatTransport, type UIMessage } from "ai"
import * as React from "react"
import { useTranslation } from "react-i18next"

import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import type { Proposal } from "@/features/recipes/tidy/queries"
import { api, CLIENT_ID, unwrap } from "@/lib/api/client"
import { cn } from "@/lib/utils"

import { useAssistant } from "./assistant-context"
import { Markdown } from "./markdown"
import {
  AttachedPhotos,
  photoIdOf,
  SentPhotos,
  useAttachedPhotos,
} from "./photos"
import { ProposalCard } from "./proposal-card"

/** Ideas to start with, on a new chat. */
const IDEAS = ["tonight", "week", "fridge", "online"] as const

/** Tools whose use is said in a line: the rest make cards. */
const LOOKUPS = new Set([
  "search_recipes",
  "get_recipe",
  "list_tags",
  "get_meal_plan",
  "get_shopping_list",
  "get_pantry",
  "web_search",
  "google_search",
])

/** The API's error, said plainly, from a failed request. */
async function failed(response: Response) {
  try {
    const body = (await response.json()) as { error?: { message?: string } }
    return body.error?.message ?? response.statusText
  } catch {
    return response.statusText
  }
}

/**
 * A chat with the assistant: its messages, streamed in as they come, with
 * the tools it uses and the cards it makes, and the box to write in. A new
 * chat is started with its first message.
 */
export function ChatView({
  chatId,
  initialMessages,
  onStarted,
}: {
  chatId: string | null
  initialMessages: UIMessage[]
  onStarted: (chatId: string) => void
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const { page } = useAssistant()
  const [aboutPage, setAboutPage] = React.useState(true)
  const [text, setText] = React.useState("")
  const attached = useAttachedPhotos()
  const picker = React.useRef<HTMLInputElement>(null)
  const camera = React.useRef<HTMLInputElement>(null)
  const scroller = React.useRef<HTMLDivElement>(null)

  // Read when a message is sent, so they're current.
  const chat = React.useRef(chatId)
  const context = React.useRef<object | undefined>(undefined)
  context.current =
    aboutPage && page
      ? {
          ...(page.recipe ? { recipe: page.recipe.id } : {}),
          ...(page.week ? { week: page.week } : {}),
        }
      : undefined

  const transport = React.useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/assistant/chats",
        credentials: "include",
        headers: { "X-Merran-Client": CLIENT_ID },
        fetch: async (input, init) => {
          const response = await fetch(input, init)
          if (!response.ok) throw new Error(await failed(response))
          return response
        },
        prepareSendMessagesRequest: async ({ messages }) => {
          if (!chat.current) {
            const started = await unwrap(api.POST("/api/assistant/chats"))
            chat.current = started.id
            onStarted(started.id)
          }
          const last = messages.at(-1)
          const parts = last?.parts ?? []
          const said = parts
            .flatMap((part) => (part.type === "text" ? [part.text] : []))
            .join("\n")
          const photos = parts.flatMap((part) => {
            const id = part.type === "file" ? photoIdOf(part.url) : null
            return id ? [id] : []
          })
          return {
            api: `/api/assistant/chats/${chat.current}/messages`,
            body: {
              text: said,
              ...(photos.length > 0 ? { photos } : {}),
              context: context.current,
            },
          }
        },
      }),
    [onStarted]
  )
  const { messages, sendMessage, status, error, stop, clearError } = useChat({
    messages: initialMessages,
    transport,
    onFinish: () => {
      void queryClient.invalidateQueries({ queryKey: ["assistant"] })
    },
  })
  const busy = status === "submitted" || status === "streaming"

  // Kept at the latest, scrolling only the chat: on a phone, scrolling the
  // page too would move it under the keyboard.
  React.useEffect(() => {
    const box = scroller.current
    if (box) box.scrollTop = box.scrollHeight
  }, [messages, status])

  const ready =
    (text.trim() !== "" || attached.photos.length > 0) && !attached.uploading

  function send(said: string) {
    const trimmed = said.trim()
    if ((!trimmed && attached.photos.length === 0) || attached.uploading) return
    if (busy) return
    clearError()
    const files = attached.take()
    void sendMessage(trimmed ? { text: trimmed, files } : { files })
    setText("")
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div
        ref={scroller}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4"
      >
        {messages.length === 0 ? (
          <div className="grid gap-3 pt-6">
            <p className="text-muted-foreground">{t("assistant.hello")}</p>
            <div className="flex flex-wrap gap-2">
              {IDEAS.map((idea) => (
                <Button
                  key={idea}
                  variant="outline"
                  size="sm"
                  className="h-auto py-1.5 whitespace-normal"
                  onClick={() => send(t(`assistant.ideas.${idea}`))}
                >
                  {t(`assistant.ideas.${idea}`)}
                </Button>
              ))}
            </div>
          </div>
        ) : (
          <ol className="grid gap-5">
            {messages.map((message) => (
              <li key={message.id}>
                <Message message={message} />
              </li>
            ))}
          </ol>
        )}
        {status === "submitted" && (
          <p className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
            <Spinner /> {t("assistant.thinking")}
          </p>
        )}
        {error && (
          <p role="alert" className="mt-4 text-sm text-destructive">
            {error.message}
          </p>
        )}
      </div>

      <form
        className="grid gap-2 border-t px-3 pt-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)]"
        onSubmit={(event) => {
          event.preventDefault()
          send(text)
        }}
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault()
          void attached.add([...event.dataTransfer.files])
        }}
      >
        {(
          [
            [picker, undefined],
            // Straight to the back camera, on a phone.
            [camera, "environment"],
          ] as const
        ).map(([ref, capture]) => (
          <input
            key={capture ?? "pick"}
            ref={ref}
            type="file"
            accept="image/*"
            capture={capture}
            multiple={!capture}
            hidden
            onChange={(event) => {
              void attached.add([...(event.target.files ?? [])])
              event.target.value = ""
            }}
          />
        ))}
        {page?.recipe && aboutPage && (
          <span className="flex w-fit max-w-full items-center gap-1 rounded-full bg-muted py-0.5 pr-1 pl-3 text-xs text-muted-foreground">
            <span className="truncate">
              {t("assistant.about", { name: page.recipe.name })}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              className="rounded-full"
              aria-label={t("assistant.notAbout")}
              onClick={() => setAboutPage(false)}
            >
              <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} />
            </Button>
          </span>
        )}
        <AttachedPhotos photos={attached.photos} onRemove={attached.remove} />
        <div className="flex items-end gap-2">
          <div className="flex">
            {/* A computer's file picker can't take one, so phones only. */}
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="hidden text-muted-foreground pointer-coarse:inline-flex"
              aria-label={t("assistant.photos.camera")}
              title={t("assistant.photos.camera")}
              disabled={attached.full}
              onClick={() => camera.current?.click()}
            >
              <HugeiconsIcon icon={Camera01Icon} strokeWidth={2} />
            </Button>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="text-muted-foreground"
              aria-label={t("assistant.photos.add")}
              title={t("assistant.photos.add")}
              disabled={attached.full}
              onClick={() => picker.current?.click()}
            >
              <HugeiconsIcon icon={ImageAdd01Icon} strokeWidth={2} />
            </Button>
          </div>
          <Textarea
            value={text}
            rows={1}
            maxLength={4000}
            enterKeyHint="send"
            placeholder={t("assistant.placeholder")}
            aria-label={t("assistant.placeholder")}
            className="max-h-40 min-h-10 resize-none"
            onChange={(event) => setText(event.target.value)}
            onPaste={(event) => {
              const files = [...event.clipboardData.files]
              if (!files.some((file) => file.type.startsWith("image/"))) return
              event.preventDefault()
              void attached.add(files)
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault()
                send(text)
              }
            }}
          />
          {busy ? (
            <Button
              type="button"
              size="icon"
              variant="outline"
              aria-label={t("assistant.stop")}
              onClick={() => void stop()}
            >
              <HugeiconsIcon icon={StopIcon} strokeWidth={2} />
            </Button>
          ) : (
            <Button
              type="submit"
              size="icon"
              aria-label={t("assistant.send")}
              disabled={!ready}
            >
              <HugeiconsIcon icon={ArrowUp02Icon} strokeWidth={2} />
            </Button>
          )}
        </div>
      </form>
    </div>
  )
}

type Part = UIMessage["parts"][number]

/** A message: the person's on the right, the assistant's with its tools. */
function Message({ message }: { message: UIMessage }) {
  const { t } = useTranslation()
  if (message.role === "user") {
    const said = message.parts
      .flatMap((part) => (part.type === "text" ? [part.text] : []))
      .join("\n")
    const photos = message.parts.flatMap((part) =>
      part.type === "file" ? [part.url] : []
    )
    return (
      <div className="grid gap-2">
        <SentPhotos urls={photos} />
        {said && (
          <p className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-md bg-primary px-3.5 py-2 whitespace-pre-wrap text-primary-foreground">
            {said}
          </p>
        )}
      </div>
    )
  }
  const sources = message.parts.flatMap((part) =>
    part.type === "source-url" ? [part] : []
  )
  return (
    <div className="grid gap-3">
      {message.parts.map((part, i) => (
        <PartView key={i} part={part} />
      ))}
      {sources.length > 0 && (
        <p className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {t("assistant.sources")}
          {sources.slice(0, 6).map((source) => (
            <a
              key={source.url}
              href={source.url}
              target="_blank"
              rel="noreferrer noopener"
              className="underline underline-offset-2"
            >
              {source.title ||
                new URL(source.url).hostname.replace(/^www\./, "")}
            </a>
          ))}
        </p>
      )}
    </div>
  )
}

function PartView({ part }: { part: Part }) {
  const { t } = useTranslation()
  if (part.type === "text") {
    return part.text ? <Markdown>{part.text}</Markdown> : null
  }
  if (!part.type.startsWith("tool-")) return null
  const name = part.type.slice(5)
  const tool = part as Part & {
    state: string
    input?: Record<string, unknown>
    output?: Record<string, unknown>
  }
  const done = tool.state === "output-available"
  if (done && tool.output?.proposal) {
    return <ProposalCard proposal={tool.output.proposal as Proposal} />
  }
  if (done && tool.output?.alreadyInLibrary) {
    const known = tool.output.alreadyInLibrary as { id: string; name: string }
    return (
      <p className="text-sm text-muted-foreground">
        {t("assistant.inLibrary", { name: known.name })}{" "}
        <Link
          to="/recipes/$slug"
          params={{ slug: known.id }}
          className="underline underline-offset-4"
        >
          {t("assistant.cards.open")}
        </Link>
      </p>
    )
  }
  if (!LOOKUPS.has(name) || tool.state === "output-error") return null
  const query =
    typeof tool.input?.query === "string" ? tool.input.query : undefined
  return (
    <p
      className={cn(
        "flex items-center gap-2 text-xs text-muted-foreground",
        !done && "animate-pulse"
      )}
    >
      {done ? (
        <HugeiconsIcon
          icon={CheckmarkCircle02Icon}
          strokeWidth={2}
          className="size-3.5"
        />
      ) : (
        <Spinner className="size-3.5" />
      )}
      {t(`assistant.tools.${name}` as "assistant.tools.search_recipes", {
        query: query ?? "",
        context: query ? "query" : undefined,
      })}
    </p>
  )
}
