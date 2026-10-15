import * as React from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Add01Icon,
  ArrowRight01Icon,
  Calendar03Icon,
  FridgeIcon,
  MoreHorizontalIcon,
  ShoppingBasket01Icon,
} from "@hugeicons/core-free-icons"
import {
  DEFAULT_LISTS,
  MAIN_LIST,
  SHOPS,
  STORE_SECTIONS,
  type ItemPrice,
  type ListPrices,
  type ShoppingItem,
  type ShoppingList,
} from "@mise/shared"
import { Link } from "react-router"
import { toast } from "sonner"

import { PageHeader } from "@/components/layout/page-header"
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
import { monthDay } from "@/features/plan/dates"
import { useHouseholdInfo } from "@/features/settings/use-household"
import { useShopStatus } from "@/features/shop/use-shop"
import { ApiError } from "@/lib/api"
import { cn } from "@/lib/utils"

import { AddFromPlanDialog } from "./add-from-plan-dialog"
import { EditItemDialog, OnHandDialog, WeeklyItemsDialog } from "./list-dialogs"
import { ListsDialog } from "./lists-dialog"
import {
  useAddListItem,
  useClearChecked,
  useList,
  useListPrices,
  usePutAway,
  useUpdateListItem,
} from "./use-list"

const LIST_KEY = "mise.list"

const SHOP_NAMES = { kroger: "Fry's", costco: "Costco", walmart: "Walmart" }

const money = (value: number) =>
  value.toLocaleString(undefined, { style: "currency", currency: "USD" })

/** The list last looked at on this device. */
function readChosenList() {
  try {
    return localStorage.getItem(LIST_KEY) ?? MAIN_LIST
  } catch {
    return MAIN_LIST
  }
}

/** What a filter keeps: everything, one meal's things, every-week items, or what was typed in. */
type Filter = "all" | "weekly" | "manual" | `meal:${string}`

function keeps(filter: Filter, item: ShoppingItem) {
  if (filter === "all") return true
  if (filter === "weekly" || filter === "manual") return item.source === filter
  return item.recipes.includes(filter.slice(5))
}

/**
 * The household's shopping lists: a card for each store with what's left,
 * about what it costs and the way to shop it, then the chosen list by aisle.
 */
export function ListPage() {
  const list = useList()
  const prices = useListPrices().data ?? {}
  const clear = useClearChecked()
  const putAway = usePutAway()
  const [fromPlan, setFromPlan] = React.useState(false)
  const [weekly, setWeekly] = React.useState(false)
  const [onHand, setOnHand] = React.useState(false)
  const [editing, setEditing] = React.useState<ShoppingItem | null>(null)
  const [managing, setManaging] = React.useState(false)
  const [showCart, setShowCart] = React.useState(false)
  const [filter, setFilter] = React.useState<Filter>("all")
  const lists = useHouseholdInfo().data?.lists ?? DEFAULT_LISTS
  const [chosenList, setChosenList] = React.useState(readChosenList)
  const current =
    lists.find((l) => l.id === chosenList) ?? lists[0] ?? DEFAULT_LISTS[0]!
  const split = lists.length > 1

  function chooseList(id: string) {
    setChosenList(id)
    setFilter("all")
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
  const filters = filtersFor(toGet)
  const shown = filters.some((f) => f.id === filter) ? filter : "all"
  const showing = toGet.filter((item) => keeps(shown, item))
  const sections = STORE_SECTIONS.map((section) => ({
    ...section,
    items: showing.filter((item) => item.sectionId === section.id),
  })).filter((section) => section.items.length)
  const priced = toGet.some((item) => prices[item.id])
  const totalLeft = all.filter((item) => !item.checked).length

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
            : totalLeft
              ? `${totalLeft} to get${split ? ` across ${lists.length} lists` : ""}`
              : "Nothing left to get."
        }
        actions={
          <>
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

      <div className="grid gap-6">
        <StoreCards
          lists={lists}
          items={all}
          prices={prices}
          current={current.id}
          split={split}
          onChoose={chooseList}
          onManage={() => setManaging(true)}
        />

        <QuickAdd list={split ? current : undefined} />

        {list.isPending ? (
          <div className="grid gap-3">
            <Skeleton className="h-40 rounded-3xl" />
            <Skeleton className="h-56 rounded-3xl" />
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
            {filters.length > 2 && (
              <div
                role="group"
                aria-label="Show"
                className="-mx-4 flex items-center gap-1.5 overflow-x-auto px-4 md:mx-0 md:flex-wrap md:px-0"
              >
                <span className="mr-1 hidden text-sm text-muted-foreground md:inline">
                  Show
                </span>
                {filters.map((f) => (
                  <Button
                    key={f.id}
                    size="sm"
                    variant={f.id === shown ? "default" : "outline"}
                    aria-pressed={f.id === shown}
                    className="shrink-0 rounded-full"
                    onClick={() => setFilter(f.id)}
                  >
                    {f.label}
                    <span
                      className={cn(
                        "tabular-nums",
                        f.id === shown
                          ? "text-primary-foreground/75"
                          : "text-muted-foreground"
                      )}
                    >
                      {f.count}
                    </span>
                  </Button>
                ))}
              </div>
            )}

            {sections.map((section) => (
              <section
                key={section.id}
                aria-labelledby={`aisle-${section.id}`}
                className="@container rounded-3xl border bg-card px-5 text-card-foreground md:px-6"
              >
                <h2
                  id={`aisle-${section.id}`}
                  className="flex items-baseline gap-2 pt-4 pb-3 text-lg font-semibold tracking-tight"
                >
                  {section.name}
                  <span className="font-sans text-sm font-normal text-muted-foreground">
                    {section.items.length}
                  </span>
                </h2>
                <ul className="divide-y border-t">
                  {section.items.map((item) => (
                    <ItemRow
                      key={item.id}
                      item={item}
                      price={prices[item.id]}
                      priced={priced}
                      onEdit={() => setEditing(item)}
                    />
                  ))}
                </ul>
              </section>
            ))}

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
              <section
                aria-labelledby="in-the-cart"
                className="rounded-3xl border bg-muted/40 px-5 md:px-6"
              >
                <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3.5">
                  <p id="in-the-cart" className="min-w-0 text-muted-foreground">
                    <span className="font-semibold text-foreground">
                      {got.length} in the cart
                    </span>
                    {!showCart && (
                      <span className="first-letter:uppercase">
                        :{" "}
                        {got.map((item) => item.name.toLowerCase()).join(", ")}
                      </span>
                    )}
                  </p>
                  <div className="flex gap-1.5">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="rounded-full"
                      aria-expanded={showCart}
                      onClick={() => setShowCart((open) => !open)}
                    >
                      {showCart ? "Hide" : "Show"}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="rounded-full bg-card"
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
                </div>
                {showCart && (
                  <ul className="divide-y border-t pb-1">
                    {got.map((item) => (
                      <ItemRow
                        key={item.id}
                        item={item}
                        priced={false}
                        onEdit={() => setEditing(item)}
                      />
                    ))}
                  </ul>
                )}
              </section>
            )}
          </>
        )}
      </div>

      <AddFromPlanDialog open={fromPlan} onOpenChange={setFromPlan} />
      <WeeklyItemsDialog open={weekly} onOpenChange={setWeekly} />
      <OnHandDialog open={onHand} onOpenChange={setOnHand} />
      <ListsDialog open={managing} onOpenChange={setManaging} />
      <EditItemDialog item={editing} onClose={() => setEditing(null)} />
    </>
  )
}

/** The ways to narrow what's left: by meal, every week, or typed in. */
function filtersFor(items: ShoppingItem[]) {
  const meals = new Map<string, number>()
  for (const item of items) {
    for (const name of item.recipes) meals.set(name, (meals.get(name) ?? 0) + 1)
  }
  const count = (source: ShoppingItem["source"]) =>
    items.filter((item) => item.source === source).length
  return [
    { id: "all" as Filter, label: "Everything", count: items.length },
    ...[...meals]
      .sort((a, b) => b[1] - a[1])
      .map(([name, n]) => ({
        id: `meal:${name}` as Filter,
        label: name,
        count: n,
      })),
    { id: "weekly" as Filter, label: "Every week", count: count("weekly") },
    { id: "manual" as Filter, label: "Added by hand", count: count("manual") },
  ].filter((f) => f.count > 0)
}

/** A card for each list: what's left, about what it costs, and how to shop it. */
function StoreCards({
  lists,
  items,
  prices,
  current,
  split,
  onChoose,
  onManage,
}: {
  lists: ShoppingList[]
  items: ShoppingItem[]
  prices: ListPrices
  current: string
  split: boolean
  onChoose: (id: string) => void
  onManage: () => void
}) {
  const banner = useShopStatus().data?.kroger.store?.banner ?? SHOP_NAMES.kroger
  const unused = SHOPS.filter(
    (shop) => !lists.some((list) => list.store === shop)
  ).map((shop) => (shop === "kroger" ? banner : SHOP_NAMES[shop]))
  const others =
    unused.length > 1
      ? `${unused.slice(0, -1).join(", ")} or ${unused.at(-1)}`
      : unused[0]
  return (
    <div
      role={split ? "tablist" : undefined}
      aria-label="Lists"
      className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-1 sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 sm:pb-0 lg:grid-cols-3"
    >
      {lists.map((list) => {
        const own = split
          ? items.filter((item) => item.listId === list.id)
          : items
        return (
          <StoreCard
            key={list.id}
            list={list}
            items={own}
            prices={prices}
            selected={split && list.id === current}
            split={split}
            onChoose={() => onChoose(list.id)}
          />
        )
      })}
      {lists.length < 4 && (
        <button
          type="button"
          onClick={onManage}
          className="grid w-64 shrink-0 snap-start content-start gap-1.5 rounded-3xl border border-dashed p-5 text-left text-muted-foreground transition-colors outline-none hover:bg-muted/40 focus-visible:ring-[3px] focus-visible:ring-ring/50 sm:w-auto"
        >
          <span className="flex items-center gap-1.5 font-heading text-xl font-semibold text-foreground">
            <HugeiconsIcon
              icon={Add01Icon}
              strokeWidth={2}
              className="size-5"
            />
            {split ? "Another store" : "Split by store"}
          </span>
          <span className="text-sm">
            {!split
              ? `Send meat and drinks to Costco, say, and everything else to ${banner}.`
              : others
                ? `Split off ${others}, with the aisles that go there.`
                : "Another list, with the aisles that go there."}
          </span>
        </button>
      )}
    </div>
  )
}

function StoreCard({
  list,
  items,
  prices,
  selected,
  split,
  onChoose,
}: {
  list: ShoppingList
  items: ShoppingItem[]
  prices: ListPrices
  selected: boolean
  split: boolean
  onChoose: () => void
}) {
  const kroger = useShopStatus().data?.kroger
  const left = items.filter((item) => !item.checked)
  const got = items.length - left.length
  const costs = left.flatMap((item) => {
    const price = prices[item.id]
    return price ? [price.total] : []
  })
  const total = costs.reduce((sum, cost) => sum + cost, 0)

  // Where it's shopped: its store, or any for a list without one.
  const actions: { to: string; label: string }[] = []
  const stores = list.store ? [list.store] : (["kroger", "costco"] as const)
  for (const store of stores) {
    if (store === "kroger") {
      if (kroger?.store) {
        actions.push({
          to: "/list/shop",
          label: `Send to the ${kroger.store.banner} cart`,
        })
      } else if (kroger?.ready) {
        actions.push({
          to: "/settings#connections",
          label: "Connect your Kroger store",
        })
      }
    } else if (store === "costco") {
      actions.push({ to: "/list/costco", label: "Find each at Costco" })
    } else {
      actions.push({
        to: "/settings#extension",
        label: "Fill the cart with the Mise extension",
      })
    }
  }

  const linked =
    list.store === "kroger" && kroger?.linked && !kroger.needsRelink
  const body = (
    <>
      <span className="flex items-center justify-between gap-2">
        <span className="truncate font-heading text-xl font-semibold">
          {list.name}
        </span>
        {linked && (
          <span className="shrink-0 rounded-full bg-accent px-2 py-0.5 text-xs font-medium text-accent-foreground">
            Linked
          </span>
        )}
      </span>
      <span className="text-sm text-muted-foreground">
        {left.length ? `${left.length} left` : "Nothing left"}
        {got > 0 && ` · ${got} in the cart`}
        {costs.length > 0 && (
          <>
            {" · "}
            <span className="font-medium text-foreground">
              about {money(total)}
            </span>
            {costs.length < left.length &&
              ` for ${costs.length} of ${left.length}`}
          </>
        )}
      </span>
      <Progress
        value={items.length ? (got / items.length) * 100 : 0}
        aria-label={`${got} of ${items.length} in the cart`}
        className="h-1.5"
      />
    </>
  )

  return (
    <div
      className={cn(
        "relative grid w-64 shrink-0 snap-start content-start gap-2.5 rounded-3xl border bg-card p-5 text-card-foreground sm:w-auto",
        selected && "border-primary ring-1 ring-primary"
      )}
    >
      {split ? (
        // The whole card picks the list; its links sit above.
        <button
          type="button"
          role="tab"
          aria-selected={selected}
          onClick={onChoose}
          className="grid gap-2.5 text-left outline-none after:absolute after:inset-0 after:rounded-3xl focus-visible:after:ring-[3px] focus-visible:after:ring-ring/50"
        >
          {body}
        </button>
      ) : (
        <div className="grid gap-2.5">{body}</div>
      )}
      {left.length > 0 &&
        actions.map((action) => (
          <Link
            key={action.to}
            to={action.to}
            className="relative z-10 flex items-center gap-1 justify-self-start text-sm font-semibold text-primary hover:underline"
          >
            {action.label}
            <HugeiconsIcon
              icon={ArrowRight01Icon}
              strokeWidth={2}
              className="size-4"
            />
          </Link>
        ))}
    </div>
  )
}

function QuickAdd({ list }: { list?: ShoppingList }) {
  const add = useAddListItem()
  const [text, setText] = React.useState("")
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        if (!text.trim()) return
        add.mutate(
          { text: text.trim(), listId: list?.id },
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
          placeholder={
            list
              ? `Add to ${list.name}, like “2 lb ground beef” or “paper towels”`
              : "Add an item, like “2 lb ground beef” or “paper towels”"
          }
          aria-label={list ? `Add to ${list.name}` : "Add an item"}
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

/** "Fry's price on Oct 14, for 2 × Great Value Diced Tomatoes". */
function priceNote(price: ItemPrice) {
  const packs = price.packages > 1 ? `${price.packages} × ` : ""
  const guess = price.sure ? "" : " (a guess at how many)"
  return `${SHOP_NAMES[price.shop]} price on ${monthDay(price.seenAt.slice(0, 10))}, for ${packs}${price.product}${guess}`
}

function ItemRow({
  item,
  price,
  priced,
  onEdit,
}: {
  item: ShoppingItem
  price?: ItemPrice
  /** Whether anything on this list has a price, so the column lines up. */
  priced: boolean
  onEdit: () => void
}) {
  const update = useUpdateListItem()
  const badges = item.checked
    ? []
    : [
        ...item.recipes.map((name) => ({ text: `For ${name}`, meal: true })),
        ...(item.source === "weekly"
          ? [{ text: "Every week", meal: false }]
          : []),
      ]
  // A narrow card: badges under the name. A wide one: all in a line.
  return (
    <li className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3.5 gap-y-1 py-3 @2xl:grid-cols-[auto_minmax(0,1fr)_auto_auto] @2xl:gap-x-4">
      <Checkbox
        className={cn(
          "col-start-1 row-start-1 size-6 rounded-md",
          badges.length > 0 && "row-span-2 @2xl:row-span-1"
        )}
        checked={item.checked}
        aria-label={`${item.checked ? "Uncheck" : "Check off"} ${item.name}`}
        onCheckedChange={(on) =>
          update.mutate({ id: item.id, checked: on === true })
        }
      />
      <button
        type="button"
        onClick={onEdit}
        className={cn(
          "col-start-2 row-start-1 flex min-w-0 items-baseline gap-1.5 rounded-md text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
          item.checked && "text-muted-foreground line-through"
        )}
        aria-label={`Edit ${item.name}`}
      >
        <span className="truncate font-medium first-letter:uppercase">
          {item.name}
        </span>
        {item.amount && (
          <span className="shrink-0 text-muted-foreground">
            · {item.amount}
          </span>
        )}
      </button>
      {badges.length > 0 && (
        <div className="col-start-2 row-start-2 flex min-w-0 flex-wrap gap-1.5 @2xl:col-start-3 @2xl:row-start-1 @2xl:max-w-sm @2xl:justify-end">
          {badges.map((badge) => (
            <span
              key={badge.text}
              className={cn(
                "inline-block max-w-full truncate rounded-full px-2.5 py-0.5 text-xs font-medium",
                badge.meal
                  ? "bg-accent text-accent-foreground"
                  : "bg-secondary text-muted-foreground"
              )}
            >
              {badge.text}
            </span>
          ))}
        </div>
      )}
      {priced && (
        <span
          className={cn(
            "col-start-3 row-start-1 min-w-14 text-right text-sm text-muted-foreground tabular-nums @2xl:col-start-4",
            badges.length > 0 && "row-span-2 @2xl:row-span-1",
            price?.sale && "font-medium text-primary"
          )}
          title={price ? priceNote(price) : undefined}
        >
          {price ? (
            <>
              {price.sure ? "" : "~"}
              {money(price.total)}
              {price.sale && <span className="sr-only"> on sale</span>}
            </>
          ) : null}
        </span>
      )}
    </li>
  )
}
