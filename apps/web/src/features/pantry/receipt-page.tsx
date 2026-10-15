import * as React from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import { Camera01Icon, File01Icon, TextIcon } from "@hugeicons/core-free-icons"
import type { ReceiptDraft, ReceiptItem } from "@mise/shared"
import { Link, useNavigate, useSearchParams } from "react-router"
import { toast } from "sonner"

import { PageHeader } from "@/components/layout/page-header"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import { monthDay } from "@/features/plan/dates"
import { ApiError } from "@/lib/api"
import { cn } from "@/lib/utils"

import { useAddReceipt, useReadReceipt, useReceipt } from "./use-receipts"

const money = (value: number) =>
  value.toLocaleString(undefined, { style: "currency", currency: "USD" })

const errorText = (error: unknown) =>
  error instanceof ApiError ? error.message : "Couldn't read that receipt"

/**
 * Scan a receipt into the pantry: a photo, a screenshot, a PDF or pasted
 * text, or one shared in and read already (`?id=`). Mise reads it, then
 * everything waits for a look.
 */
export function ReceiptPage() {
  const [params, setParams] = useSearchParams()
  const id = params.get("id")
  const read = useReadReceipt()
  const waiting = useReceipt(id)

  const draft = read.data ?? waiting.data

  return (
    <>
      <PageHeader
        title="Scan a receipt"
        description="What you bought goes in the pantry, and comes off the list."
      />
      {draft ? (
        <Review draft={draft} />
      ) : read.isPending || waiting.isLoading ? (
        <Reading />
      ) : waiting.isError ? (
        <div className="grid justify-items-start gap-3">
          <p className="text-muted-foreground">{errorText(waiting.error)}</p>
          <Button variant="outline" onClick={() => setParams({})}>
            Scan one here instead
          </Button>
        </div>
      ) : (
        <Upload
          error={read.isError ? errorText(read.error) : null}
          onRead={(input) =>
            read.mutate(input, {
              onError: (error) => toast.error(errorText(error)),
            })
          }
        />
      )}
    </>
  )
}

function Reading() {
  return (
    <div className="grid gap-3">
      <p className="flex items-center gap-2 text-muted-foreground">
        <Spinner /> Reading the receipt. This takes a few seconds.
      </p>
      <Skeleton className="h-14 rounded-2xl" />
      <Skeleton className="h-14 rounded-2xl" />
      <Skeleton className="h-14 rounded-2xl" />
    </div>
  )
}

function Upload({
  error,
  onRead,
}: {
  error: string | null
  onRead: (input: { files: File[] } | { text: string }) => void
}) {
  const camera = React.useRef<HTMLInputElement>(null)
  const files = React.useRef<HTMLInputElement>(null)
  const [pasting, setPasting] = React.useState(false)
  const [text, setText] = React.useState("")

  const pick = (event: React.ChangeEvent<HTMLInputElement>) => {
    const chosen = [...(event.target.files ?? [])]
    event.target.value = ""
    if (chosen.length) onRead({ files: chosen })
  }

  return (
    <div className="grid max-w-2xl gap-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <ChoiceButton
          icon={Camera01Icon}
          title="Take a photo"
          detail="Of a paper receipt"
          onClick={() => camera.current?.click()}
        />
        <ChoiceButton
          icon={File01Icon}
          title="Choose files"
          detail="Screenshots or a PDF"
          onClick={() => files.current?.click()}
        />
        <ChoiceButton
          icon={TextIcon}
          title="Paste text"
          detail="From an emailed receipt"
          onClick={() => setPasting(true)}
        />
      </div>
      <input
        ref={camera}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={pick}
      />
      <input
        ref={files}
        type="file"
        accept="image/*,application/pdf"
        multiple
        className="hidden"
        onChange={pick}
      />
      {pasting && (
        <form
          className="grid gap-2"
          onSubmit={(event) => {
            event.preventDefault()
            if (text.trim()) onRead({ text })
          }}
        >
          <Textarea
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder="Paste the receipt here: the items and prices from the email."
            rows={8}
            autoFocus
          />
          <Button
            type="submit"
            className="justify-self-start"
            disabled={!text.trim()}
          >
            Read it
          </Button>
        </form>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
      <p className="text-sm text-muted-foreground">
        Got a receipt by email? You can share it to Mise from your phone. See{" "}
        <Link
          to="/settings#share"
          className="font-medium text-foreground underline underline-offset-4"
        >
          Share to Mise
        </Link>{" "}
        in Settings.
      </p>
    </div>
  )
}

function ChoiceButton({
  icon,
  title,
  detail,
  onClick,
}: {
  icon: typeof Camera01Icon
  title: string
  detail: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="grid justify-items-start gap-2 rounded-3xl border bg-card p-4 text-left transition-colors outline-none hover:bg-accent/40 focus-visible:ring-[3px] focus-visible:ring-ring/50"
    >
      <span className="flex size-10 items-center justify-center rounded-2xl bg-accent text-accent-foreground">
        <HugeiconsIcon icon={icon} strokeWidth={2} />
      </span>
      <span className="font-medium">{title}</span>
      <span className="text-sm text-muted-foreground">{detail}</span>
    </button>
  )
}

type Choice = { on: boolean; name: string; amount: string }

/** Every line, food ticked; names and amounts can be fixed before adding. */
function Review({ draft }: { draft: ReceiptDraft }) {
  const navigate = useNavigate()
  const add = useAddReceipt()
  const [choices, setChoices] = React.useState<Record<string, Choice>>(() =>
    Object.fromEntries(
      draft.items.map((item) => [
        item.id,
        {
          on: item.kind === "food",
          name: item.name,
          amount: item.amount ?? "",
        },
      ])
    )
  )
  const chosen = draft.items.filter((item) => choices[item.id]?.on)
  const offTheList = chosen.filter((item) => item.listItem).length
  const change = (id: string, next: Partial<Choice>) =>
    setChoices((current) => ({
      ...current,
      [id]: { ...current[id]!, ...next },
    }))

  function addAll() {
    add.mutate(
      {
        id: draft.id,
        items: chosen.map((item) => ({
          id: item.id,
          name: choices[item.id]!.name.trim() || item.name,
          amount: choices[item.id]!.amount.trim() || null,
        })),
      },
      {
        onSuccess: (result) => {
          toast.success(
            `Added ${result.added} to the pantry${result.offTheList ? `, and took ${result.offTheList} off the list` : ""}`
          )
          navigate("/pantry")
        },
        onError: (error) =>
          toast.error(
            error instanceof ApiError ? error.message : "Couldn't add those"
          ),
      }
    )
  }

  if (!draft.items.length) {
    return (
      <div className="grid justify-items-start gap-3">
        <p className="text-muted-foreground">
          No items found. Is it a receipt? A clearer photo, or the receipt's
          text, usually works.
        </p>
        <Button variant="outline" asChild>
          <Link to="/pantry/receipt">Try another</Link>
        </Button>
      </div>
    )
  }

  return (
    <div className="grid max-w-3xl gap-4">
      <p className="text-sm text-muted-foreground">
        {[
          draft.store,
          draft.date && monthDay(draft.date),
          draft.total !== null && money(draft.total),
          `${draft.items.length} ${draft.items.length === 1 ? "item" : "items"}`,
        ]
          .filter(Boolean)
          .join(" · ")}
      </p>
      <ul className="divide-y rounded-3xl border bg-card">
        {draft.items.map((item) => (
          <ReviewRow
            key={item.id}
            item={item}
            choice={choices[item.id]!}
            onChange={(next) => change(item.id, next)}
          />
        ))}
      </ul>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
        <Button variant="ghost" asChild>
          <Link to="/pantry">Cancel</Link>
        </Button>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          {offTheList > 0 && (
            <span className="text-sm text-muted-foreground">
              {offTheList} {offTheList === 1 ? "comes" : "come"} off the list
            </span>
          )}
          <Button disabled={!chosen.length || add.isPending} onClick={addAll}>
            {add.isPending && <Spinner data-icon="inline-start" />}
            Add {chosen.length} to the pantry
          </Button>
        </div>
      </div>
    </div>
  )
}

function ReviewRow({
  item,
  choice,
  onChange,
}: {
  item: ReceiptItem
  choice: Choice
  onChange: (next: Partial<Choice>) => void
}) {
  const id = React.useId()
  return (
    <li
      className={cn(
        "grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1.5 p-3.5",
        !choice.on && "opacity-60"
      )}
    >
      <Checkbox
        id={id}
        className="mt-2 size-5"
        checked={choice.on}
        onCheckedChange={(on) => onChange({ on: on === true })}
        aria-label={`Add ${choice.name}`}
      />
      <div className="grid gap-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <Input
            value={choice.name}
            onChange={(event) => onChange({ name: event.target.value })}
            aria-label="What it is"
            className="h-9 min-w-0 flex-1 basis-48"
          />
          <Input
            value={choice.amount}
            onChange={(event) => onChange({ amount: event.target.value })}
            placeholder="Amount"
            aria-label="How much"
            className="h-9 w-24"
          />
          {item.price !== null && (
            <span className="w-16 text-right text-sm text-muted-foreground tabular-nums">
              {money(item.price)}
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <span className="text-muted-foreground">{item.text}</span>
          {item.listItem && (
            <span className="rounded-full bg-accent px-2 py-0.5 font-medium text-accent-foreground">
              On your list: {item.listItem.name}
            </span>
          )}
          {item.kind !== "food" && (
            <span className="rounded-full bg-secondary px-2 py-0.5 text-muted-foreground">
              Not food
            </span>
          )}
        </div>
      </div>
    </li>
  )
}
