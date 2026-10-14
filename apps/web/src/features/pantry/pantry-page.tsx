import * as React from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Add01Icon,
  FridgeIcon,
  MoreHorizontalIcon,
  ShoppingBasketAdd01Icon,
} from "@hugeicons/core-free-icons"
import {
  addDays,
  DEFAULT_ON_HAND,
  STORE_SECTIONS,
  whyUseSoon,
  type PantryItem,
  type UseSoonReason,
} from "@mise/shared"
import { toast } from "sonner"

import { PageHeader } from "@/components/layout/page-header"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group"
import { Skeleton } from "@/components/ui/skeleton"
import { OnHandDialog } from "@/features/list/list-dialogs"
import { useAddListItem } from "@/features/list/use-list"
import {
  dayInSentence,
  monthDay,
  shortDayName,
  today,
} from "@/features/plan/dates"
import { useHouseholdInfo } from "@/features/settings/use-household"
import { ApiError } from "@/lib/api"
import { cn } from "@/lib/utils"

import { EditPantryDialog } from "./edit-pantry-dialog"
import { useAddPantryItem, usePantry, useRemovePantryItem } from "./use-pantry"

/** What's at home, by aisle, with what to use soon at the top. */
export function PantryPage() {
  const pantry = usePantry()
  const remove = useRemovePantryItem()
  const add = useAddPantryItem()
  const addToList = useAddListItem()
  const [editing, setEditing] = React.useState<PantryItem | null>(null)
  const [onHand, setOnHand] = React.useState(false)

  const now = today()
  const items = (pantry.data ?? []).map((item) => ({
    item,
    soon: whyUseSoon(item, now),
  }))
  const soon = items
    .filter((row) => row.soon)
    .sort((a, b) => urgency(a.soon!) - urgency(b.soon!))
  const sections = STORE_SECTIONS.map((section) => ({
    ...section,
    rows: items.filter((row) => !row.soon && row.item.sectionId === section.id),
  })).filter((section) => section.rows.length)

  function usedUp(item: PantryItem) {
    remove.mutate(item.id, {
      onSuccess: () =>
        toast(`Used up: ${item.name}`, {
          action: {
            label: "Undo",
            onClick: () =>
              add.mutate([item.amount, item.name].filter(Boolean).join(" ")),
          },
        }),
      onError: failed,
    })
  }

  function toList(name: string) {
    addToList.mutate(name, {
      onSuccess: () => toast.success(`Added ${name} to the list`),
      onError: failed,
    })
  }

  const count = pantry.data?.length ?? 0
  return (
    <>
      <PageHeader
        title="Pantry"
        description={
          !pantry.data
            ? "What's on hand, and what to use soon."
            : count
              ? `${count} ${count === 1 ? "thing" : "things"} at home${soon.length ? `, ${soon.length} to use soon` : ""}`
              : "What's on hand, and what to use soon."
        }
      />

      <div className="grid max-w-2xl gap-6">
        <QuickAdd />

        {pantry.isPending ? (
          <div className="grid gap-2">
            <Skeleton className="h-12" />
            <Skeleton className="h-12" />
            <Skeleton className="h-12" />
          </div>
        ) : pantry.isError ? (
          <p className="text-muted-foreground">Couldn't load the pantry.</p>
        ) : !count ? (
          <Empty className="border border-dashed">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <HugeiconsIcon icon={FridgeIcon} strokeWidth={2} />
              </EmptyMedia>
              <EmptyTitle>Nothing in the pantry yet</EmptyTitle>
              <EmptyDescription>
                Tap Put away on the List after shopping and everything you
                bought lands here. Or type what you already have above.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <>
            {soon.length > 0 && (
              <section className="grid gap-1">
                <h2 className="text-xs font-medium tracking-wide text-amber-700 uppercase dark:text-amber-400">
                  Use soon
                </h2>
                <ul className="divide-y rounded-2xl border border-amber-500/40 bg-card">
                  {soon.map(({ item, soon }) => (
                    <PantryRow
                      key={item.id}
                      item={item}
                      soon={soon}
                      onEdit={() => setEditing(item)}
                      onUsedUp={() => usedUp(item)}
                      onToList={() => toList(item.name)}
                    />
                  ))}
                </ul>
              </section>
            )}
            {sections.map((section) => (
              <section key={section.id} className="grid gap-1">
                <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  {section.name}
                </h2>
                <ul className="divide-y rounded-2xl border bg-card">
                  {section.rows.map(({ item }) => (
                    <PantryRow
                      key={item.id}
                      item={item}
                      soon={null}
                      onEdit={() => setEditing(item)}
                      onUsedUp={() => usedUp(item)}
                      onToList={() => toList(item.name)}
                    />
                  ))}
                </ul>
              </section>
            ))}
          </>
        )}

        <AlwaysOnHand onEdit={() => setOnHand(true)} onLow={toList} />
      </div>

      <EditPantryDialog
        item={editing}
        onClose={() => setEditing(null)}
        onUsedUp={usedUp}
      />
      <OnHandDialog open={onHand} onOpenChange={setOnHand} />
    </>
  )
}

function failed(error: unknown) {
  toast.error(error instanceof ApiError ? error.message : "Couldn't save that")
}

/** Past dates first, then by date, then leftovers. */
function urgency(soon: UseSoonReason) {
  if (soon.kind === "leftover") return Number.MAX_SAFE_INTEGER
  return Date.parse(soon.date)
}

/** "Use by tomorrow", "Use by Oct 20". */
function labelForUseBy(date: string) {
  const now = today()
  return date <= addDays(now, 6)
    ? `Use by ${dayInSentence(date)}`
    : `Use by ${monthDay(date)}`
}

function soonLabel(soon: UseSoonReason) {
  if (soon.kind !== "leftover") {
    return soon.kind === "past"
      ? `Past its use-by date (${monthDay(soon.date)})`
      : labelForUseBy(soon.date)
  }
  const meal = soon.meals[0]!
  return meal.status === "skipped"
    ? `Bought for ${meal.name}, which was skipped`
    : `Bought for ${meal.name} on ${shortDayName(meal.date)}, not cooked yet`
}

function PantryRow({
  item,
  soon,
  onEdit,
  onUsedUp,
  onToList,
}: {
  item: PantryItem
  soon: UseSoonReason | null
  onEdit: () => void
  onUsedUp: () => void
  onToList: () => void
}) {
  const now = today()
  const upcoming = item.meals.filter(
    (meal) => meal.status === "planned" && meal.date >= now
  )
  const detail = soon
    ? soonLabel(soon)
    : upcoming.length
      ? `For ${upcoming
          .map((meal) => `${meal.name} (${shortDayName(meal.date)})`)
          .join(", ")}`
      : item.useBy
        ? labelForUseBy(item.useBy)
        : null

  return (
    <li className="flex items-center gap-3 py-1.5 pr-1.5 pl-3">
      <button
        type="button"
        onClick={onEdit}
        className="grid min-w-0 flex-1 gap-0.5 py-1 text-left"
        aria-label={`Edit ${item.name}`}
      >
        <span className="flex items-baseline gap-2">
          <span className="truncate font-medium first-letter:uppercase">
            {item.name}
          </span>
          {item.amount && (
            <span className="shrink-0 text-sm text-muted-foreground">
              {item.amount}
            </span>
          )}
        </span>
        {detail && (
          <span
            className={cn(
              "truncate text-xs text-muted-foreground",
              soon?.kind === "past" && "text-destructive",
              soon?.kind === "soon" && "text-amber-700 dark:text-amber-400"
            )}
          >
            {detail}
          </span>
        )}
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Options for ${item.name}`}
          >
            <HugeiconsIcon icon={MoreHorizontalIcon} strokeWidth={2} />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem onSelect={onToList}>
            <HugeiconsIcon icon={ShoppingBasketAdd01Icon} strokeWidth={2} />
            Add to the list
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={onEdit}>Edit</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={onUsedUp}>
            Used up
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  )
}

/** Things assumed to be at home. Tapping one when it runs low adds it to the list. */
function AlwaysOnHand({
  onEdit,
  onLow,
}: {
  onEdit: () => void
  onLow: (name: string) => void
}) {
  const household = useHouseholdInfo()
  const onHand = household.data?.onHand ?? DEFAULT_ON_HAND
  return (
    <section className="grid gap-2">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Always on hand
        </h2>
        <Button variant="ghost" size="sm" onClick={onEdit}>
          Edit
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">
        Left off lists made from the plan. Tap one when it runs low to add it to
        the list.
      </p>
      <div className="flex flex-wrap gap-2">
        {onHand.map((name) => (
          <Button
            key={name}
            variant="outline"
            size="sm"
            className="rounded-full"
            aria-label={`Running low on ${name}: add it to the list`}
            onClick={() => onLow(name)}
          >
            <span className="first-letter:uppercase">{name}</span>
            <HugeiconsIcon
              icon={ShoppingBasketAdd01Icon}
              strokeWidth={2}
              data-icon="inline-end"
              className="text-muted-foreground"
            />
          </Button>
        ))}
      </div>
    </section>
  )
}

function QuickAdd() {
  const add = useAddPantryItem()
  const [text, setText] = React.useState("")
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        if (!text.trim()) return
        add.mutate(text.trim(), {
          onSuccess: () => setText(""),
          onError: failed,
        })
      }}
    >
      <InputGroup>
        <InputGroupInput
          placeholder="Add something, like “2 lb chicken thighs” or “rice”"
          aria-label="Add to the pantry"
          enterKeyHint="done"
          value={text}
          onChange={(event) => setText(event.target.value)}
        />
        <InputGroupAddon align="inline-end">
          <InputGroupButton
            type="submit"
            size="icon-xs"
            variant="default"
            aria-label="Add"
            disabled={!text.trim() || add.isPending}
          >
            <HugeiconsIcon icon={Add01Icon} strokeWidth={2} />
          </InputGroupButton>
        </InputGroupAddon>
      </InputGroup>
    </form>
  )
}
