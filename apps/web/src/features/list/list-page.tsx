import {
  Add01Icon,
  Calendar03Icon,
  Cancel01Icon,
  Delete02Icon,
  MoreHorizontalIcon,
  RepeatIcon,
  ShoppingBasket01Icon,
  Store01Icon,
  Tick02Icon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useQuery } from "@tanstack/react-query"
import * as React from "react"
import { useTranslation } from "react-i18next"

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
import { SelectionBar, SelectionHeader } from "@/features/select/selection-bar"
import {
  useSelection,
  useSelectionKeepOnly,
} from "@/features/select/use-selection"

import { AddFromPlanDialog } from "./add-from-plan-dialog"
import { ItemRow } from "./item-row"
import {
  AisleDialog,
  EditItemDialog,
  EveryWeekDialog,
  OnHandDialog,
} from "./list-dialogs"
import { listQuery, type ListItem } from "./queries"
import { useListActions } from "./use-list-actions"

/**
 * The shopping list: add from the plan or type things in, then what's
 * left to get by aisle in a walk through the store, and what's in the cart
 * under it.
 */
export function ListPage() {
  const { t } = useTranslation()
  const list = useQuery(listQuery)
  const actions = useListActions()
  const [fromPlan, setFromPlan] = React.useState(false)
  const [everyWeek, setEveryWeek] = React.useState(false)
  const [onHand, setOnHand] = React.useState(false)
  const [editing, setEditing] = React.useState<ListItem | null>(null)
  const [choosingAisle, setChoosingAisle] = React.useState(false)
  const [showCart, setShowCart] = React.useState(false)

  const aisles = list.data?.aisles ?? []
  const items = list.data?.items ?? []
  const toGet = items.filter((item) => !item.checked)
  const got = items.filter((item) => item.checked)
  const byAisle = [
    ...aisles.map((aisle) => ({
      id: aisle.id,
      name: aisle.name,
      items: toGet.filter((item) => item.aisle === aisle.id),
    })),
    {
      id: "none",
      name: t("list.noAisle"),
      items: toGet.filter(
        (item) => !aisles.some((aisle) => aisle.id === item.aisle)
      ),
    },
  ].filter((aisle) => aisle.items.length > 0)

  const selection = useSelection()
  const selectable = [...toGet, ...(showCart ? got : [])].map((item) => item.id)
  useSelectionKeepOnly(selection, selectable)
  const picked = selectable.filter((id) => selection.isPicked(id))

  const bulk = async (
    action: Parameters<typeof actions.bulk>[1],
    said: (count: number) => string
  ) => {
    if (await actions.bulk(picked, action, said)) selection.done()
  }

  return (
    <>
      <PageHeader
        title={t("list.title")}
        description={
          list.isPending
            ? t("list.loading")
            : toGet.length > 0
              ? t("list.toGet", { count: toGet.length })
              : t("list.nothingToGet")
        }
        actions={
          selection.selecting ? (
            <SelectionHeader selection={selection} allIds={selectable} />
          ) : (
            <>
              <Button onClick={() => setFromPlan(true)}>
                <HugeiconsIcon
                  icon={Calendar03Icon}
                  strokeWidth={2}
                  data-icon="inline-start"
                />
                {t("list.fromPlan")}
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button
                      variant="outline"
                      size="icon"
                      aria-label={t("list.more")}
                    />
                  }
                >
                  <HugeiconsIcon icon={MoreHorizontalIcon} strokeWidth={2} />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52">
                  <DropdownMenuItem
                    disabled={selectable.length === 0}
                    onClick={() => selection.start()}
                  >
                    {t("list.select")}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => setEveryWeek(true)}>
                    {t("list.everyWeek")}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setOnHand(true)}>
                    {t("list.onHand")}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    disabled={got.length === 0}
                    onClick={() => void actions.clear("checked")}
                  >
                    {t("list.clearChecked")}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    variant="destructive"
                    disabled={items.length === 0}
                    onClick={() => void actions.clear("all")}
                  >
                    {t("list.clearAll")}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          )
        }
      />

      <div className="grid gap-6">
        <QuickAdd />

        {list.isPending ? (
          <div className="grid gap-3">
            <Skeleton className="h-40 rounded-3xl" />
            <Skeleton className="h-56 rounded-3xl" />
          </div>
        ) : items.length === 0 ? (
          <Empty className="rounded-3xl border border-dashed">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <HugeiconsIcon icon={ShoppingBasket01Icon} strokeWidth={2} />
              </EmptyMedia>
              <EmptyTitle>{t("list.empty")}</EmptyTitle>
              <EmptyDescription>{t("list.emptyHint")}</EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <div className="flex flex-wrap justify-center gap-2">
                <Button onClick={() => setFromPlan(true)}>
                  {t("list.fromPlan")}
                </Button>
                <Button variant="outline" onClick={() => setEveryWeek(true)}>
                  {t("list.setUpEveryWeek")}
                </Button>
              </div>
            </EmptyContent>
          </Empty>
        ) : (
          <>
            {byAisle.map((aisle) => (
              <section
                key={aisle.id}
                aria-labelledby={`aisle-${aisle.id}`}
                className="@container rounded-3xl border bg-card px-5 text-card-foreground md:px-6"
              >
                <h2
                  id={`aisle-${aisle.id}`}
                  className="flex items-baseline gap-2 pt-4 pb-3 text-lg font-semibold tracking-tight"
                >
                  {aisle.name}
                  <span className="font-sans text-sm font-normal text-muted-foreground">
                    {aisle.items.length}
                  </span>
                </h2>
                <ul className="divide-y border-t">
                  {aisle.items.map((item) => (
                    <ItemRow
                      key={item.id}
                      item={item}
                      selection={selection}
                      onEdit={() => setEditing(item)}
                    />
                  ))}
                </ul>
              </section>
            ))}

            {toGet.length === 0 && (
              <p className="py-4 text-center text-muted-foreground">
                {t("list.allDone")}
              </p>
            )}

            {got.length > 0 && (
              <section
                aria-labelledby="in-the-cart"
                className="@container rounded-3xl border bg-muted/40 px-5 md:px-6"
              >
                <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3.5">
                  <p id="in-the-cart" className="min-w-0 text-muted-foreground">
                    <span className="font-semibold text-foreground">
                      {t("list.inTheCart", { count: got.length })}
                    </span>
                    {!showCart && (
                      <span>
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
                      {showCart ? t("list.hide") : t("list.show")}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="rounded-full bg-card"
                      onClick={() => void actions.clear("checked")}
                    >
                      {t("list.clearChecked")}
                    </Button>
                  </div>
                </div>
                {showCart && (
                  <ul className="divide-y border-t pb-1">
                    {got.map((item) => (
                      <ItemRow
                        key={item.id}
                        item={item}
                        selection={selection}
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

      <SelectionBar
        selection={selection}
        actions={[
          {
            label: t("list.bulk.check"),
            icon: Tick02Icon,
            onSelect: () =>
              void bulk({ action: "check" }, (count) =>
                t("list.bulk.checked", { count })
              ),
          },
          ...(showCart
            ? [
                {
                  label: t("list.bulk.uncheck"),
                  icon: Cancel01Icon,
                  onSelect: () =>
                    void bulk({ action: "uncheck" }, (count) =>
                      t("list.bulk.unchecked", { count })
                    ),
                },
              ]
            : []),
          {
            label: t("list.bulk.aisle"),
            icon: Store01Icon,
            onSelect: () => setChoosingAisle(true),
          },
          {
            label: t("list.bulk.everyWeek"),
            icon: RepeatIcon,
            onSelect: () =>
              void bulk({ action: "every-week" }, (count) =>
                t("list.bulk.weekly", { count })
              ),
          },
          {
            label: t("list.bulk.remove"),
            icon: Delete02Icon,
            destructive: true,
            onSelect: () =>
              void bulk({ action: "remove" }, (count) =>
                t("list.bulk.removed", { count })
              ),
          },
        ]}
      />
      <AisleDialog
        count={picked.length}
        aisles={aisles}
        open={choosingAisle}
        onOpenChange={setChoosingAisle}
        onPick={(aisle) => {
          setChoosingAisle(false)
          void bulk({ action: "aisle", aisle: aisle?.id ?? null }, (count) =>
            t("list.bulk.moved", {
              count,
              aisle: aisle?.name ?? t("list.noAisle"),
            })
          )
        }}
      />
      <AddFromPlanDialog open={fromPlan} onOpenChange={setFromPlan} />
      <EveryWeekDialog open={everyWeek} onOpenChange={setEveryWeek} />
      <OnHandDialog open={onHand} onOpenChange={setOnHand} />
      <EditItemDialog
        item={editing}
        aisles={aisles}
        onClose={() => setEditing(null)}
      />
    </>
  )
}

/** Type something onto the list: "2 lb ground beef" or "paper towels". */
function QuickAdd() {
  const { t } = useTranslation()
  const actions = useListActions()
  const [text, setText] = React.useState("")
  const [busy, setBusy] = React.useState(false)

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        const typed = text.trim()
        if (!typed) return
        setBusy(true)
        void actions.add({ text: typed }).then((added) => {
          setBusy(false)
          if (added) setText("")
        })
      }}
    >
      <InputGroup>
        <InputGroupInput
          placeholder={t("list.add")}
          aria-label={t("list.addLabel")}
          enterKeyHint="done"
          maxLength={200}
          value={text}
          onChange={(event) => setText(event.target.value)}
        />
        <InputGroupAddon align="inline-end">
          <InputGroupButton
            type="submit"
            size="icon-xs"
            variant="default"
            aria-label={t("list.addButton")}
            disabled={!text.trim() || busy}
          >
            <HugeiconsIcon icon={Add01Icon} strokeWidth={2} />
          </InputGroupButton>
        </InputGroupAddon>
      </InputGroup>
    </form>
  )
}
