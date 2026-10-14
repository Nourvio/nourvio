import * as React from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  ArrowLeft01Icon,
  ArrowRight01Icon,
  ShoppingBasket01Icon,
} from "@hugeicons/core-free-icons"
import {
  addDays,
  DEFAULT_MEALS,
  isoDate,
  startOfWeek,
  type Meal,
  type PlanEntry,
} from "@mise/shared"
import { useSearchParams } from "react-router"

import { PageHeader } from "@/components/layout/page-header"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { AddFromPlanDialog } from "@/features/list/add-from-plan-dialog"
import { useHouseholdInfo } from "@/features/settings/use-household"

import { AddEntryDialog } from "./add-entry-dialog"
import { today, weekLabel } from "./dates"
import { DayCard } from "./day-card"
import { EditEntryDialog } from "./edit-entry-dialog"
import { usePlan } from "./use-plan"

/** The week's meals, one day at a time. `?week=` holds the week's first day. */
export function PlanPage() {
  const household = useHouseholdInfo()
  const weekStart = household.data?.weekStart ?? 0
  const meals = household.data?.meals ?? DEFAULT_MEALS
  const [params, setParams] = useSearchParams()
  const now = today()
  const thisWeek = startOfWeek(now, weekStart)
  const requested = isoDate.safeParse(params.get("week"))
  const start = requested.success
    ? startOfWeek(requested.data, weekStart)
    : thisWeek
  const end = addDays(start, 6)
  const plan = usePlan(start, end)
  const [adding, setAdding] = React.useState<{
    date: string
    meal: Meal
  } | null>(null)
  const [editing, setEditing] = React.useState<PlanEntry | null>(null)
  const [listing, setListing] = React.useState(false)

  function goTo(week: string) {
    setParams(
      (current) => {
        const next = new URLSearchParams(current)
        if (week === thisWeek) next.delete("week")
        else next.set("week", week)
        return next
      },
      { replace: true }
    )
  }

  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i))
  const label =
    start === thisWeek
      ? "This week"
      : start === addDays(thisWeek, 7)
        ? "Next week"
        : start === addDays(thisWeek, -7)
          ? "Last week"
          : null

  return (
    <>
      <PageHeader
        title="Plan"
        description={`${label ? `${label}, ` : ""}${weekLabel(start)}`}
        actions={
          <Button variant="outline" onClick={() => setListing(true)}>
            <HugeiconsIcon
              icon={ShoppingBasket01Icon}
              strokeWidth={2}
              data-icon="inline-start"
            />
            Add to list
          </Button>
        }
      />

      <div className="grid max-w-3xl gap-4">
        <div className="flex items-center justify-between gap-2">
          <Button
            variant="outline"
            size="icon"
            aria-label="Previous week"
            onClick={() => goTo(addDays(start, -7))}
          >
            <HugeiconsIcon icon={ArrowLeft01Icon} strokeWidth={2} />
          </Button>
          <div className="flex items-center gap-2">
            <span className="font-medium">{weekLabel(start)}</span>
            {start !== thisWeek && (
              <Button variant="ghost" size="sm" onClick={() => goTo(thisWeek)}>
                This week
              </Button>
            )}
          </div>
          <Button
            variant="outline"
            size="icon"
            aria-label="Next week"
            onClick={() => goTo(addDays(start, 7))}
          >
            <HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={2} />
          </Button>
        </div>

        {plan.isPending || household.isPending ? (
          Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-36 rounded-2xl" />
          ))
        ) : plan.isError ? (
          <p className="text-muted-foreground">Couldn't load the plan.</p>
        ) : (
          days.map((date) => (
            <DayCard
              key={date}
              date={date}
              isToday={date === now}
              isPast={date < now}
              meals={meals}
              entries={plan.data.filter((entry) => entry.date === date)}
              onAdd={(meal) => setAdding({ date, meal })}
              onEdit={setEditing}
            />
          ))
        )}
      </div>

      <AddEntryDialog slot={adding} onClose={() => setAdding(null)} />
      <AddFromPlanDialog
        open={listing}
        onOpenChange={setListing}
        initialWeek={start}
      />
      <EditEntryDialog
        entry={editing}
        meals={meals}
        onClose={() => setEditing(null)}
      />
    </>
  )
}
