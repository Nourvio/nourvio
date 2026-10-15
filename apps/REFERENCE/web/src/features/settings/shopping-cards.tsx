import * as React from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { OnHandDialog, WeeklyItemsDialog } from "@/features/list/list-dialogs"
import { ListsDialog } from "@/features/list/lists-dialog"
import { useWeeklyItems } from "@/features/list/use-list"
import { useShopStatus } from "@/features/shop/use-shop"

import { useHouseholdInfo } from "./use-household"

const STORE_NAMES = { costco: "Costco", walmart: "Walmart" } as const

/** The household's shopping lists, and where each one's things go. */
export function ListsCard() {
  const household = useHouseholdInfo()
  const kroger = useShopStatus().data?.kroger.store?.banner ?? "Kroger"
  const [editing, setEditing] = React.useState(false)
  const lists = household.data?.lists ?? []
  return (
    <Card>
      <CardHeader>
        <CardTitle>Lists</CardTitle>
        <CardDescription>
          A list for each store you shop at. Things sort onto them by aisle, and
          by where you've moved them before.
        </CardDescription>
        <CardAction>
          <Button variant="outline" onClick={() => setEditing(true)}>
            {lists.length > 1 ? "Edit lists" : "Split by store"}
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        {household.isPending ? (
          <Skeleton className="h-12" />
        ) : (
          <ul className="grid gap-2">
            {lists.map((list, index) => (
              <li
                key={list.id}
                className="flex flex-wrap items-center gap-2 rounded-2xl border px-4 py-3 text-sm"
              >
                <span className="font-medium">{list.name}</span>
                {list.store && (
                  <Badge variant="secondary">
                    {list.store === "kroger" ? kroger : STORE_NAMES[list.store]}
                  </Badge>
                )}
                <span className="text-muted-foreground">
                  {index === 0
                    ? "· the main list, for everything else"
                    : list.sections.length
                      ? `· ${list.sections.length} ${list.sections.length === 1 ? "aisle" : "aisles"}`
                      : "· what you move here"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
      <ListsDialog open={editing} onOpenChange={setEditing} />
    </Card>
  )
}

/** Things always at home, left off lists made from the plan. */
export function OnHandCard() {
  const household = useHouseholdInfo()
  const [editing, setEditing] = React.useState(false)
  const items = household.data?.onHand ?? []
  return (
    <Card>
      <CardHeader>
        <CardTitle>Always on hand</CardTitle>
        <CardDescription>Left off lists made from the plan.</CardDescription>
        <CardAction>
          <Button variant="outline" onClick={() => setEditing(true)}>
            Edit
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        <Chips
          items={items}
          empty="Nothing yet."
          loading={household.isPending}
        />
      </CardContent>
      <OnHandDialog open={editing} onOpenChange={setEditing} />
    </Card>
  )
}

/** Things bought every week, whatever's planned. */
export function WeeklyCard() {
  const weekly = useWeeklyItems()
  const [editing, setEditing] = React.useState(false)
  return (
    <Card>
      <CardHeader>
        <CardTitle>Every week</CardTitle>
        <CardDescription>
          Bought whatever's planned, and added with each week's meals.
        </CardDescription>
        <CardAction>
          <Button variant="outline" onClick={() => setEditing(true)}>
            Edit
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        <Chips
          items={(weekly.data ?? []).map((item) =>
            item.amount ? `${item.name} · ${item.amount}` : item.name
          )}
          empty="Nothing yet, like milk or coffee."
          loading={weekly.isPending}
        />
      </CardContent>
      <WeeklyItemsDialog open={editing} onOpenChange={setEditing} />
    </Card>
  )
}

function Chips({
  items,
  empty,
  loading,
}: {
  items: string[]
  empty: string
  loading: boolean
}) {
  if (loading) return <Skeleton className="h-8" />
  if (!items.length) {
    return <p className="text-sm text-muted-foreground">{empty}</p>
  }
  return (
    <ul className="flex flex-wrap gap-2">
      {items.map((item) => (
        <li
          key={item}
          className="rounded-full bg-secondary px-3 py-1 text-sm first-letter:uppercase"
        >
          {item}
        </li>
      ))}
    </ul>
  )
}
