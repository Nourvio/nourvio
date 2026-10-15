import * as React from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Add01Icon,
  BubbleChatSparkIcon,
  Calendar03Icon,
  CheckmarkCircle02Icon,
  FridgeIcon,
  Invoice01Icon,
  MoreHorizontalIcon,
  ShoppingBasketAdd01Icon,
  Store01Icon,
} from "@hugeicons/core-free-icons"
import {
  DEFAULT_ON_HAND,
  STORE_SECTIONS,
  whyUseSoon,
  type PantryBulkInput,
  type PantryItem,
  type UseSoonReason,
} from "@mise/shared"
import { Link } from "react-router"
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
import { useChat } from "@/features/chat/chat-provider"
import { OnHandDialog } from "@/features/list/list-dialogs"
import { useAddListItem } from "@/features/list/use-list"
import { monthDay, shortDayName, today } from "@/features/plan/dates"
import { AisleDialog } from "@/features/select/aisle-dialog"
import { SelectMark } from "@/features/select/select-mark"
import {
  SelectionBar,
  SelectionHeader,
  useSelectionKeepOnly,
} from "@/features/select/selection-bar"
import { undoable, useHidden } from "@/features/select/undo"
import { useLongPress, useSelection } from "@/features/select/use-selection"
import { useAiStatus } from "@/features/settings/use-ai"
import { useHouseholdInfo } from "@/features/settings/use-household"
import { ApiError } from "@/lib/api"
import { cn } from "@/lib/utils"

import { EditPantryDialog } from "./edit-pantry-dialog"
import { labelForUseBy, soonTag, soonWhen, urgency } from "./soon"
import { UseByDialog } from "./use-by-dialog"
import {
  useAddPantryItem,
  usePantry,
  usePantryBulk,
  useRemovePantryItem,
} from "./use-pantry"

type Row = { item: PantryItem; soon: UseSoonReason | null }

const things = (n: number) => `${n} ${n === 1 ? "thing" : "things"}`

/** An item's part in select mode. */
type ItemSelect = {
  selecting: boolean
  picked: boolean
  onToggle: () => void
  /** A long press on a phone, which starts selecting with this one. */
  onLongPress: () => void
}

const SECTION_NAMES = new Map<string, string>(
  STORE_SECTIONS.map((section) => [section.id, section.name])
)

/**
 * What's at home, one aisle after another, with what to use soon at the top
 * and what's always on hand at the bottom.
 */
export function PantryPage() {
  const pantry = usePantry()
  const remove = useRemovePantryItem()
  const add = useAddPantryItem()
  const addToList = useAddListItem()
  const [editing, setEditing] = React.useState<PantryItem | null>(null)
  const [onHand, setOnHand] = React.useState(false)

  const now = today()
  const isHidden = useHidden()
  const items: Row[] = (pantry.data ?? [])
    .filter((item) => !isHidden(item.id))
    .map((item) => ({ item, soon: whyUseSoon(item, now) }))
  const soon = items
    .filter((row) => row.soon)
    .sort((a, b) => urgency(a.soon!) - urgency(b.soon!))
  const sections = STORE_SECTIONS.map((section) => ({
    ...section,
    rows: items.filter((row) => row.item.sectionId === section.id),
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

  // Select mode, over everything at home.
  const selection = useSelection()
  const bulk = usePantryBulk()
  const [dialog, setDialog] = React.useState<"aisle" | "useBy" | null>(null)
  const selectable = items.map((row) => row.item.id)
  useSelectionKeepOnly(selection, selectable)
  const pickedIds = selectable.filter((id) => selection.isPicked(id))
  const selectOf = (id: string): ItemSelect => ({
    selecting: selection.selecting,
    picked: selection.isPicked(id),
    onToggle: () => selection.toggle(id),
    onLongPress: () => selection.start(id),
  })

  /** Out of the pantry, with Undo. */
  function removeWithUndo(ids: string[], message: string) {
    undoable({
      message,
      ids,
      commit: () => bulk.mutateAsync({ action: "delete", ids }),
    })
  }

  function run(input: PantryBulkInput, said: (changed: number) => string) {
    setDialog(null)
    bulk.mutate(input, {
      onSuccess: ({ changed }) => {
        toast.success(said(changed))
        selection.done()
      },
      onError: failed,
    })
  }

  const count = items.length
  return (
    <>
      <PageHeader
        title="Pantry"
        description={
          count
            ? `${count} ${count === 1 ? "thing" : "things"} at home${soon.length ? `, ${soon.length} to use soon` : ""}`
            : "What's on hand, and what to use soon."
        }
        actions={
          selection.selecting ? (
            <SelectionHeader selection={selection} allIds={selectable} />
          ) : (
            <>
              <Button variant="outline" asChild>
                <Link to="/pantry/receipt">
                  <HugeiconsIcon
                    icon={Invoice01Icon}
                    strokeWidth={2}
                    data-icon="inline-start"
                  />
                  Scan a receipt
                </Link>
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon"
                    aria-label="More pantry options"
                  >
                    <HugeiconsIcon icon={MoreHorizontalIcon} strokeWidth={2} />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuItem
                    disabled={!count}
                    onSelect={() => selection.start()}
                  >
                    Select
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => setOnHand(true)}>
                    Always on hand
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    variant="destructive"
                    disabled={!count}
                    onSelect={() =>
                      removeWithUndo(selectable, "Cleared the pantry")
                    }
                  >
                    Clear the pantry
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          )
        }
      />

      <div className="grid gap-6">
        <QuickAdd />

        {pantry.isPending ? (
          <div className="grid gap-3">
            <Skeleton className="h-32 rounded-3xl" />
            <Skeleton className="h-48 rounded-3xl" />
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
              <UseSoon
                rows={soon}
                onOpen={(item) => setEditing(item)}
                selectOf={selectOf}
                onToss={(ids) =>
                  removeWithUndo(
                    ids,
                    ids.length === 1
                      ? "Tossed the one past its date"
                      : `Tossed ${ids.length} things past their date`
                  )
                }
              />
            )}
            {sections.length > 2 && <JumpTo sections={sections} />}
            {sections.map((section) => (
              <section
                key={section.id}
                id={`aisle-${section.id}`}
                aria-labelledby={`aisle-${section.id}-title`}
                className="@container scroll-mt-20 rounded-3xl border bg-card px-5 text-card-foreground md:px-6"
              >
                <h2
                  id={`aisle-${section.id}-title`}
                  className="flex items-baseline gap-2 pt-4 pb-3 text-lg font-semibold tracking-tight"
                >
                  {section.name}
                  <span className="font-sans text-sm font-normal text-muted-foreground">
                    {section.rows.length}
                  </span>
                </h2>
                <ul className="divide-y border-t">
                  {section.rows.map(({ item, soon }) => (
                    <PantryRow
                      key={item.id}
                      item={item}
                      soon={soon}
                      onEdit={() => setEditing(item)}
                      onUsedUp={() => usedUp(item)}
                      onToList={() => toList(item.name)}
                      select={selectOf(item.id)}
                    />
                  ))}
                </ul>
              </section>
            ))}
          </>
        )}

        <AlwaysOnHand onEdit={() => setOnHand(true)} onLow={toList} />
      </div>

      <SelectionBar
        selection={selection}
        actions={[
          {
            label: "Used up",
            icon: CheckmarkCircle02Icon,
            onSelect: () => {
              removeWithUndo(pickedIds, `Used up ${things(pickedIds.length)}`)
              selection.done()
            },
          },
          {
            label: "Add to list",
            icon: ShoppingBasketAdd01Icon,
            onSelect: () =>
              run({ action: "toList", ids: pickedIds }, (changed) =>
                changed
                  ? `Added ${things(changed)} to the list`
                  : "They're on the list already"
              ),
          },
          {
            label: "Aisle",
            icon: Store01Icon,
            onSelect: () => setDialog("aisle"),
          },
          {
            label: "Use by",
            icon: Calendar03Icon,
            onSelect: () => setDialog("useBy"),
          },
        ]}
      />
      <AisleDialog
        count={pickedIds.length}
        open={dialog === "aisle"}
        onOpenChange={(open) => setDialog(open ? "aisle" : null)}
        onPick={(sectionId) =>
          run(
            { action: "aisle", ids: pickedIds, sectionId },
            (changed) =>
              `Moved ${things(changed)} to ${SECTION_NAMES.get(sectionId)}`
          )
        }
      />
      <UseByDialog
        count={pickedIds.length}
        open={dialog === "useBy"}
        onOpenChange={(open) => setDialog(open ? "useBy" : null)}
        onPick={(useBy) =>
          run({ action: "useBy", ids: pickedIds, useBy }, (changed) =>
            useBy
              ? `${things(changed)} to use by ${monthDay(useBy)}`
              : `Took the date off ${things(changed)}`
          )
        }
      />
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

/** Planned meals still to come that an item was bought for. */
function upcomingMeals(item: PantryItem) {
  const now = today()
  return item.meals.filter(
    (meal) => meal.status === "planned" && meal.date >= now
  )
}

/** Food to cook before it turns, most urgent first, with a way to ask for ideas. */
function UseSoon({
  rows,
  onOpen,
  selectOf,
  onToss,
}: {
  rows: Row[]
  onOpen: (item: PantryItem) => void
  /** While selecting, a card picks its item instead of opening it. */
  selectOf: (id: string) => ItemSelect
  /** Throws out what's past its date. */
  onToss: (ids: string[]) => void
}) {
  const chat = useChat()
  const ai = useAiStatus()
  const past = rows.filter((row) => row.soon?.kind === "past")
  const selecting = rows.length > 0 && selectOf(rows[0]!.item.id).selecting
  const names = rows.map(({ item }) => item.name.toLowerCase())
  const listed =
    names.length > 1
      ? `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`
      : names[0]

  return (
    <section
      aria-labelledby="use-soon"
      className="grid gap-4 rounded-3xl border border-amber-500/30 bg-amber-500/[0.07] p-5 md:p-6"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="grid gap-0.5">
          <h2 id="use-soon" className="text-xl font-semibold tracking-tight">
            Use soon
          </h2>
          <p className="text-sm text-muted-foreground">
            {rows.length === 1
              ? "One thing to cook before it turns."
              : `${rows.length} things to cook before they turn.`}
          </p>
        </div>
        {!selecting && (
          <div className="flex flex-wrap gap-2">
            {past.length > 0 && (
              <Button
                variant="outline"
                className="bg-card"
                onClick={() => onToss(past.map((row) => row.item.id))}
              >
                {past.length === 1
                  ? "Toss the one past its date"
                  : `Toss the ${past.length} past their date`}
              </Button>
            )}
            {ai.data?.available && (
              <Button
                onClick={() =>
                  chat.ask(
                    `What can I cook in the next few days to use up the ${listed}?`
                  )
                }
              >
                <HugeiconsIcon
                  icon={BubbleChatSparkIcon}
                  strokeWidth={2}
                  data-icon="inline-start"
                />
                Ideas for these
              </Button>
            )}
          </div>
        )}
      </div>
      {/* A row to swipe through on phones; a grid when there's room. */}
      <ul className="-mx-5 flex snap-x gap-2 overflow-x-auto px-5 pb-1 md:mx-0 md:grid md:grid-cols-3 md:overflow-visible md:px-0 md:pb-0 lg:grid-cols-4">
        {rows.map(({ item, soon }) => {
          const meal = upcomingMeals(item)[0]
          const detail =
            soon!.kind === "leftover"
              ? `Bought for ${soon!.meals[0]!.name}`
              : meal
                ? `For ${meal.name} · ${shortDayName(meal.date)}`
                : [item.amount, SECTION_NAMES.get(item.sectionId)]
                    .filter(Boolean)
                    .join(" · ")
          const urgent =
            soon!.kind === "past" ||
            (soon!.kind === "soon" &&
              (soonWhen(soon!) === "Today" || soonWhen(soon!) === "Tomorrow"))
          const select = selectOf(item.id)
          return (
            <li key={item.id} className="w-40 shrink-0 snap-start md:w-auto">
              <button
                type="button"
                onClick={() =>
                  select.selecting ? select.onToggle() : onOpen(item)
                }
                aria-pressed={select.selecting ? select.picked : undefined}
                className={cn(
                  "grid h-full w-full content-start gap-0.5 rounded-2xl bg-card px-3.5 py-3 text-left text-card-foreground transition-colors outline-none hover:bg-accent/60 focus-visible:ring-[3px] focus-visible:ring-ring/50",
                  select.picked && "ring-2 ring-primary"
                )}
              >
                <span
                  className={cn(
                    "text-xs font-semibold tracking-wide text-muted-foreground uppercase",
                    urgent && "text-amber-700 dark:text-amber-400",
                    soon!.kind === "past" && "text-destructive"
                  )}
                >
                  {soonWhen(soon!)}
                </span>
                <span className="truncate font-semibold first-letter:uppercase">
                  {item.name}
                </span>
                {detail && (
                  <span className="truncate text-sm text-muted-foreground">
                    {detail}
                  </span>
                )}
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

/** Buttons that scroll to each aisle, for a long pantry. */
function JumpTo({
  sections,
}: {
  sections: { id: string; name: string; rows: Row[] }[]
}) {
  function jump(id: string) {
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    document
      .getElementById(`aisle-${id}`)
      ?.scrollIntoView({ behavior: still ? "auto" : "smooth", block: "start" })
  }
  return (
    <nav
      aria-label="Aisles"
      className="-mx-4 flex items-center gap-1.5 overflow-x-auto px-4 md:mx-0 md:flex-wrap md:px-0"
    >
      <span className="mr-1 hidden text-sm text-muted-foreground md:inline">
        Jump to
      </span>
      {sections.map((section) => (
        <Button
          key={section.id}
          variant="outline"
          size="sm"
          className="shrink-0 rounded-full"
          onClick={() => jump(section.id)}
        >
          {section.name}
          <span className="text-muted-foreground">{section.rows.length}</span>
        </Button>
      ))}
    </nav>
  )
}

type Tag = { text: string; tone: "meal" | "soon" | "past" | "plain" }

const TAG_TONES: Record<Tag["tone"], string> = {
  meal: "bg-accent text-accent-foreground",
  soon: "bg-amber-500/15 text-amber-800 dark:text-amber-300",
  past: "bg-destructive/10 text-destructive",
  plain: "bg-secondary text-muted-foreground",
}

/** What's worth knowing about an item: the meals it's for, and when to use it by. */
function tagsFor(item: PantryItem, soon: UseSoonReason | null): Tag[] {
  const tags: Tag[] = upcomingMeals(item)
    .slice(0, 2)
    .map((meal) => ({
      text: `For ${meal.name} · ${shortDayName(meal.date)}`,
      tone: "meal",
    }))
  if (soon) {
    tags.push({
      text: soonTag(soon),
      tone: soon.kind === "past" ? "past" : "soon",
    })
  } else if (item.useBy) {
    tags.push({ text: labelForUseBy(item.useBy), tone: "plain" })
  }
  return tags
}

function PantryRow({
  item,
  soon,
  onEdit,
  onUsedUp,
  onToList,
  select,
}: {
  item: PantryItem
  soon: UseSoonReason | null
  onEdit: () => void
  onUsedUp: () => void
  onToList: () => void
  select?: ItemSelect
}) {
  const tags = tagsFor(item, soon)
  const selecting = select?.selecting ?? false
  const press = useLongPress(
    () => select?.onLongPress(),
    Boolean(select && !selecting)
  )
  // A narrow card: tags under the name. A wide one: name, tags, then buttons in a line.
  return (
    <li className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 py-3 @3xl:grid-cols-[minmax(0,1fr)_auto_auto] @3xl:gap-x-4">
      <button
        type="button"
        onClick={selecting ? select?.onToggle : onEdit}
        {...(selecting ? {} : press)}
        className={cn(
          "col-start-1 row-start-1 flex min-w-0 items-baseline gap-1.5 rounded-md text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
          selecting && "items-center gap-3"
        )}
        aria-pressed={selecting ? select?.picked : undefined}
        aria-label={
          selecting
            ? `${select?.picked ? "Unselect" : "Select"} ${item.name}`
            : `Edit ${item.name}`
        }
      >
        {selecting && (
          <SelectMark picked={select?.picked ?? false} className="shrink-0" />
        )}
        <span className="truncate font-medium first-letter:uppercase">
          {item.name}
        </span>
        {item.amount && (
          <span className="shrink-0 text-muted-foreground">
            · {item.amount}
          </span>
        )}
      </button>
      {tags.length > 0 && (
        <div className="col-start-1 row-start-2 flex min-w-0 flex-wrap gap-1.5 @3xl:col-start-2 @3xl:row-start-1 @3xl:max-w-xs @3xl:justify-end">
          {tags.map((tag) => (
            <span
              key={tag.text}
              className={cn(
                "inline-block max-w-full truncate rounded-full px-2.5 py-0.5 text-xs font-medium",
                TAG_TONES[tag.tone]
              )}
            >
              {tag.text}
            </span>
          ))}
        </div>
      )}
      <div
        className={cn(
          "col-start-2 row-start-1 flex items-center gap-1.5 @3xl:col-start-3",
          tags.length > 0 && "row-span-2 @3xl:row-span-1",
          selecting && "invisible"
        )}
      >
        <Button
          variant="outline"
          size="sm"
          className="rounded-full"
          onClick={onUsedUp}
          aria-label={`Used up ${item.name}`}
        >
          Used up
        </Button>
        <Button
          variant="secondary"
          size="sm"
          className="hidden rounded-full sm:inline-flex"
          onClick={onToList}
          aria-label={`Add ${item.name} to the list`}
        >
          <HugeiconsIcon
            icon={ShoppingBasketAdd01Icon}
            strokeWidth={2}
            data-icon="inline-start"
          />
          List
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              className="rounded-full"
              aria-label={`Options for ${item.name}`}
            >
              <HugeiconsIcon icon={MoreHorizontalIcon} strokeWidth={2} />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem onSelect={onEdit}>Edit</DropdownMenuItem>
            <DropdownMenuItem onSelect={onToList}>
              <HugeiconsIcon icon={ShoppingBasketAdd01Icon} strokeWidth={2} />
              Add to the list
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
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
    <section
      aria-labelledby="on-hand"
      className="grid gap-3 rounded-3xl border border-dashed bg-muted/40 p-5 md:p-6"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="grid gap-0.5">
          <h2 id="on-hand" className="text-lg font-semibold tracking-tight">
            Always on hand
          </h2>
          <p className="text-sm text-muted-foreground">
            Left off lists made from the plan.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="rounded-full bg-card"
          onClick={onEdit}
        >
          Edit
        </Button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {household.isPending ? (
          <Skeleton className="h-8 w-48 rounded-full" />
        ) : (
          onHand.map((name) => (
            <Button
              key={name}
              variant="outline"
              size="sm"
              className="rounded-full bg-card"
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
          ))
        )}
        <span className="ml-1 text-sm text-muted-foreground">
          Running low? Tap one to add it to the list.
        </span>
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
          placeholder="Add something, like “2 cans black beans” or “rice”"
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
