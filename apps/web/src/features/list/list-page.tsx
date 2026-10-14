import * as React from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Add01Icon,
  Calendar03Icon,
  FridgeIcon,
  MoreHorizontalIcon,
  ShoppingBasket01Icon,
  ShoppingCart01Icon,
} from "@hugeicons/core-free-icons"
import {
  DEFAULT_LISTS,
  MAIN_LIST,
  STORE_SECTIONS,
  type ShoppingItem,
} from "@mise/shared"
import { Link } from "react-router"
import { toast } from "sonner"

import { PageHeader } from "@/components/layout/page-header"
import { Panel, WithAside } from "@/components/layout/page-layout"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
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
  InputGroupInput,
} from "@/components/ui/input-group"
import { Progress } from "@/components/ui/progress"
import { Skeleton } from "@/components/ui/skeleton"
import { ApiError } from "@/lib/api"
import { cn } from "@/lib/utils"

import { useHouseholdInfo } from "@/features/settings/use-household"
import { useShopStatus } from "@/features/shop/use-shop"

import { AddFromPlanDialog } from "./add-from-plan-dialog"
import { EditItemDialog, OnHandDialog, WeeklyItemsDialog } from "./list-dialogs"
import { ListsDialog } from "./lists-dialog"
import {
  useAddListItem,
  useClearChecked,
  useList,
  usePutAway,
  useUpdateListItem,
  useWeeklyItems,
} from "./use-list"

const LIST_KEY = "mise.list"

/** The list last looked at on this device. */
function readChosenList() {
  try {
    return localStorage.getItem(LIST_KEY) ?? MAIN_LIST
  } catch {
    return MAIN_LIST
  }
}

/** The household's shopping list, in store order, with checked items at the bottom. */
export function ListPage() {
  const list = useList()
  const kroger = useShopStatus().data?.kroger
  const clear = useClearChecked()
  const putAway = usePutAway()
  const [fromPlan, setFromPlan] = React.useState(false)
  const [weekly, setWeekly] = React.useState(false)
  const [onHand, setOnHand] = React.useState(false)
  const [editing, setEditing] = React.useState<ShoppingItem | null>(null)
  const [managing, setManaging] = React.useState(false)
  const lists = useHouseholdInfo().data?.lists ?? DEFAULT_LISTS
  const [chosenList, setChosenList] = React.useState(readChosenList)
  const current =
    lists.find((l) => l.id === chosenList) ?? lists[0] ?? DEFAULT_LISTS[0]!
  const split = lists.length > 1

  function chooseList(id: string) {
    setChosenList(id)
    try {
      localStorage.setItem(LIST_KEY, id)
    } catch {
      // Not remembered; no harm.
    }
  }

  const all = list.data ?? []
  // With several lists, the one chosen; else everything.
  const items = split ? all.filter((item) => item.listId === current.id) : all
  const toGet = items.filter((item) => !item.checked)
  const got = items.filter((item) => item.checked)
  const sections = STORE_SECTIONS.map((section) => ({
    ...section,
    items: toGet.filter((item) => item.sectionId === section.id),
  })).filter((section) => section.items.length)

  function putAwayChecked() {
    putAway.mutate(undefined, {
      onSuccess: ({ stored }) =>
        toast.success(
          stored
            ? `Put ${stored} ${stored === 1 ? "thing" : "things"} in the pantry`
            : "Cleared the cart"
        ),
      onError: (error) =>
        toast.error(
          error instanceof ApiError ? error.message : "Couldn't put those away"
        ),
    })
  }

  function clearChecked() {
    clear.mutate(undefined, {
      onSuccess: ({ removed }) =>
        toast(`Cleared ${removed} checked ${removed === 1 ? "item" : "items"}`),
    })
  }

  return (
    <>
      <PageHeader
        title="List"
        description={
          list.isPending
            ? "Everything to pick up."
            : toGet.length
              ? `${toGet.length} to get${split ? ` on ${current.name}` : ""}`
              : "Nothing left to get."
        }
        actions={
          <>
            {toGet.length > 0 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline">
                    <HugeiconsIcon
                      icon={ShoppingCart01Icon}
                      strokeWidth={2}
                      data-icon="inline-start"
                    />
                    Shop
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  {kroger?.store ? (
                    <DropdownMenuItem asChild>
                      <Link to="/list/shop">Send to {kroger.store.banner}</Link>
                    </DropdownMenuItem>
                  ) : (
                    <DropdownMenuItem asChild>
                      <Link to="/settings#connections">Connect Fry's</Link>
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem asChild>
                    <Link to="/list/costco">Shop at Costco</Link>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            <Button onClick={() => setFromPlan(true)}>
              <HugeiconsIcon
                icon={Calendar03Icon}
                strokeWidth={2}
                data-icon="inline-start"
              />
              Add from plan
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  aria-label="More list options"
                >
                  <HugeiconsIcon icon={MoreHorizontalIcon} strokeWidth={2} />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuItem onSelect={() => setManaging(true)}>
                  {split ? "Edit lists" : "Split into lists by store"}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => setWeekly(true)}>
                  Every week items
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setOnHand(true)}>
                  Always on hand
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  disabled={!got.length}
                  onSelect={putAwayChecked}
                >
                  Put checked items away
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={!got.length}
                  onSelect={clearChecked}
                >
                  Clear checked items
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        }
      />

      {split && (
        <div
          className="-mt-2 mb-4 flex flex-wrap items-center gap-2"
          role="tablist"
        >
          {lists.map((l) => {
            const left = all.filter(
              (i) => i.listId === l.id && !i.checked
            ).length
            return (
              <Button
                key={l.id}
                role="tab"
                aria-selected={l.id === current.id}
                size="sm"
                variant={l.id === current.id ? "secondary" : "ghost"}
                className="rounded-full"
                onClick={() => chooseList(l.id)}
              >
                {l.name}
                <span className="text-muted-foreground tabular-nums">
                  {left}
                </span>
              </Button>
            )
          })}
          <Button
            size="sm"
            variant="link"
            className="text-muted-foreground"
            onClick={() => setManaging(true)}
          >
            Edit lists
          </Button>
        </div>
      )}

      <WithAside
        aside={
          <ListAside
            items={items}
            putting={putAway.isPending}
            onPutAway={putAwayChecked}
            onWeekly={() => setWeekly(true)}
            onOnHand={() => setOnHand(true)}
          />
        }
      >
        <QuickAdd listId={split ? current.id : undefined} />

        {list.isPending ? (
          <div className="grid gap-2">
            <Skeleton className="h-12" />
            <Skeleton className="h-12" />
            <Skeleton className="h-12" />
          </div>
        ) : list.isError ? (
          <p className="text-muted-foreground">Couldn't load the list.</p>
        ) : split && all.length > 0 && !items.length ? (
          <p className="py-6 text-center text-muted-foreground">
            Nothing on the {current.name} list. Move things here by tapping them
            on another list, or choose which aisles go here in{" "}
            <button
              type="button"
              className="font-medium text-foreground underline underline-offset-4"
              onClick={() => setManaging(true)}
            >
              Edit lists
            </button>
            .
          </p>
        ) : !items.length ? (
          <Empty className="border border-dashed">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <HugeiconsIcon icon={ShoppingBasket01Icon} strokeWidth={2} />
              </EmptyMedia>
              <EmptyTitle>The list is empty</EmptyTitle>
              <EmptyDescription>
                Add the week's planned meals and Mise works out what to buy,
                grouped by aisle. Things you get every week come along too.
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <div className="flex flex-wrap justify-center gap-2">
                <Button onClick={() => setFromPlan(true)}>Add from plan</Button>
                <Button variant="outline" onClick={() => setWeekly(true)}>
                  Set up every-week items
                </Button>
              </div>
            </EmptyContent>
          </Empty>
        ) : (
          <>
            {/* Aisles side by side when there's room, each kept whole. */}
            <div className="gap-x-6 md:columns-2">
              {sections.map((section) => (
                <section
                  key={section.id}
                  className="mb-6 grid break-inside-avoid gap-1"
                >
                  <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                    {section.name}
                  </h2>
                  <ul className="divide-y rounded-2xl border bg-card">
                    {section.items.map((item) => (
                      <ItemRow
                        key={item.id}
                        item={item}
                        onEdit={() => setEditing(item)}
                      />
                    ))}
                  </ul>
                </section>
              ))}
            </div>
            {!toGet.length && (
              <div className="grid justify-items-center gap-3 py-4 text-center">
                <p className="text-muted-foreground">
                  All done. Nice shopping.
                </p>
                {got.length > 0 && (
                  <Button disabled={putAway.isPending} onClick={putAwayChecked}>
                    <HugeiconsIcon
                      icon={FridgeIcon}
                      strokeWidth={2}
                      data-icon="inline-start"
                    />
                    Put it all away
                  </Button>
                )}
              </div>
            )}
            {got.length > 0 && (
              <section className="grid gap-1">
                <div className="flex items-center justify-between">
                  <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                    In the cart ({got.length})
                  </h2>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={putAway.isPending}
                    onClick={putAwayChecked}
                  >
                    <HugeiconsIcon
                      icon={FridgeIcon}
                      strokeWidth={2}
                      data-icon="inline-start"
                    />
                    Put away
                  </Button>
                </div>
                <ul className="divide-y rounded-2xl border bg-card/60">
                  {got.map((item) => (
                    <ItemRow
                      key={item.id}
                      item={item}
                      onEdit={() => setEditing(item)}
                    />
                  ))}
                </ul>
              </section>
            )}
          </>
        )}
      </WithAside>

      <AddFromPlanDialog open={fromPlan} onOpenChange={setFromPlan} />
      <WeeklyItemsDialog open={weekly} onOpenChange={setWeekly} />
      <OnHandDialog open={onHand} onOpenChange={setOnHand} />
      <ListsDialog open={managing} onOpenChange={setManaging} />
      <EditItemDialog item={editing} onClose={() => setEditing(null)} />
    </>
  )
}

/** Beside the list: how the shop is going, what it's for, and what comes every week. */
function ListAside({
  items,
  putting,
  onPutAway,
  onWeekly,
  onOnHand,
}: {
  items: ShoppingItem[]
  putting: boolean
  onPutAway: () => void
  onWeekly: () => void
  onOnHand: () => void
}) {
  const weekly = useWeeklyItems()
  const got = items.filter((item) => item.checked).length
  const left = items.length - got
  const meals = new Map<string, number>()
  for (const item of items) {
    for (const name of item.recipes) meals.set(name, (meals.get(name) ?? 0) + 1)
  }
  const forMeals = [...meals].sort((a, b) => b[1] - a[1])
  return (
    <>
      {items.length > 0 && (
        <Panel title="This shop">
          <p className="font-heading text-3xl font-semibold">
            {left}{" "}
            <span className="font-sans text-base font-normal text-muted-foreground">
              left to get
            </span>
          </p>
          <Progress
            value={(got / items.length) * 100}
            aria-label="In the cart"
          />
          <p className="text-sm text-muted-foreground">
            {got} of {items.length} in the cart
          </p>
          {got > 0 && (
            <Button
              className="justify-self-start"
              disabled={putting}
              onClick={onPutAway}
            >
              <HugeiconsIcon
                icon={FridgeIcon}
                strokeWidth={2}
                data-icon="inline-start"
              />
              Put {got} away
            </Button>
          )}
        </Panel>
      )}
      {forMeals.length > 0 && (
        <Panel title="For these meals" to="/plan" link="Plan">
          <ul className="grid gap-1.5 text-sm">
            {forMeals.slice(0, 8).map(([name, count]) => (
              <li key={name} className="flex items-baseline gap-3">
                <span className="min-w-0 flex-1 truncate">{name}</span>
                <span className="shrink-0 text-muted-foreground tabular-nums">
                  {count} {count === 1 ? "item" : "items"}
                </span>
              </li>
            ))}
          </ul>
          {forMeals.length > 8 && (
            <p className="text-xs text-muted-foreground">
              And {forMeals.length - 8} more.
            </p>
          )}
        </Panel>
      )}
      <Panel
        title="Every week"
        action={
          <Button variant="ghost" size="sm" onClick={onWeekly}>
            Edit
          </Button>
        }
      >
        {weekly.data?.length ? (
          <p className="text-sm text-muted-foreground first-letter:uppercase">
            {weekly.data.map((item) => item.name).join(", ")}
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">
            Things you buy whatever's planned, like milk or coffee, come along
            with each week's meals.
          </p>
        )}
        <Button
          variant="link"
          size="sm"
          className="h-auto justify-self-start px-0"
          onClick={onOnHand}
        >
          Always on hand
        </Button>
      </Panel>
    </>
  )
}

function QuickAdd({ listId }: { listId?: string }) {
  const add = useAddListItem()
  const [text, setText] = React.useState("")
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        if (!text.trim()) return
        add.mutate(
          { text: text.trim(), listId },
          {
            onSuccess: () => setText(""),
            onError: (error) =>
              toast.error(
                error instanceof ApiError ? error.message : "Couldn't add that"
              ),
          }
        )
      }}
    >
      <InputGroup>
        <InputGroupInput
          placeholder="Add an item, like “2 lb ground beef” or “paper towels”"
          aria-label="Add an item"
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

function ItemRow({ item, onEdit }: { item: ShoppingItem; onEdit: () => void }) {
  const update = useUpdateListItem()
  const id = `item-${item.id}`
  return (
    <li className="flex items-center gap-3 px-3 py-2.5">
      <Checkbox
        id={id}
        className="size-6 rounded-md"
        checked={item.checked}
        aria-label={`${item.checked ? "Uncheck" : "Check off"} ${item.name}`}
        onCheckedChange={(on) =>
          update.mutate({ id: item.id, checked: on === true })
        }
      />
      <button
        type="button"
        onClick={onEdit}
        className="grid min-w-0 flex-1 gap-0.5 text-left"
        aria-label={`Edit ${item.name}`}
      >
        <span
          className={cn(
            "flex items-baseline gap-2",
            item.checked && "text-muted-foreground line-through"
          )}
        >
          <span className="truncate font-medium first-letter:uppercase">
            {item.name}
          </span>
          {item.amount && (
            <span className="shrink-0 text-sm text-muted-foreground">
              {item.amount}
            </span>
          )}
        </span>
        {!item.checked &&
          (item.recipes.length > 0 || item.source === "weekly") && (
            <span className="truncate text-xs text-muted-foreground">
              {item.source === "weekly"
                ? "Every week"
                : `For ${item.recipes.join(", ")}`}
            </span>
          )}
      </button>
    </li>
  )
}
