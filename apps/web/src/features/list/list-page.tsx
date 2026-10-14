import * as React from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Add01Icon,
  Calendar03Icon,
  FridgeIcon,
  MoreHorizontalIcon,
  ShoppingBasket01Icon,
} from "@hugeicons/core-free-icons"
import { STORE_SECTIONS, type ShoppingItem } from "@mise/shared"
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
import { Skeleton } from "@/components/ui/skeleton"
import { ApiError } from "@/lib/api"
import { cn } from "@/lib/utils"

import { AddFromPlanDialog } from "./add-from-plan-dialog"
import { EditItemDialog, OnHandDialog, WeeklyItemsDialog } from "./list-dialogs"
import {
  useAddListItem,
  useClearChecked,
  useList,
  usePutAway,
  useUpdateListItem,
} from "./use-list"

/** The household's shopping list, in store order, with checked items at the bottom. */
export function ListPage() {
  const list = useList()
  const clear = useClearChecked()
  const putAway = usePutAway()
  const [fromPlan, setFromPlan] = React.useState(false)
  const [weekly, setWeekly] = React.useState(false)
  const [onHand, setOnHand] = React.useState(false)
  const [editing, setEditing] = React.useState<ShoppingItem | null>(null)

  const items = list.data ?? []
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
              ? `${toGet.length} to get`
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

      <div className="grid max-w-2xl gap-6">
        <QuickAdd />

        {list.isPending ? (
          <div className="grid gap-2">
            <Skeleton className="h-12" />
            <Skeleton className="h-12" />
            <Skeleton className="h-12" />
          </div>
        ) : list.isError ? (
          <p className="text-muted-foreground">Couldn't load the list.</p>
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
            {sections.map((section) => (
              <section key={section.id} className="grid gap-1">
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
      </div>

      <AddFromPlanDialog open={fromPlan} onOpenChange={setFromPlan} />
      <WeeklyItemsDialog open={weekly} onOpenChange={setWeekly} />
      <OnHandDialog open={onHand} onOpenChange={setOnHand} />
      <EditItemDialog item={editing} onClose={() => setEditing(null)} />
    </>
  )
}

function QuickAdd() {
  const add = useAddListItem()
  const [text, setText] = React.useState("")
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        if (!text.trim()) return
        add.mutate(text.trim(), {
          onSuccess: () => setText(""),
          onError: (error) =>
            toast.error(
              error instanceof ApiError ? error.message : "Couldn't add that"
            ),
        })
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
