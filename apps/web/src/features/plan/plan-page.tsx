import * as React from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  ArrowLeft01Icon,
  ArrowRight01Icon,
  ShoppingBasket01Icon,
  SparklesIcon,
} from "@hugeicons/core-free-icons"
import {
  addDays,
  DEFAULT_MEALS,
  isoDate,
  planTotals,
  startOfWeek,
  type Meal,
  type PlanEntry,
} from "@mise/shared"
import { useSearchParams } from "react-router"

import { PageHeader } from "@/components/layout/page-header"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { useChatScreen } from "@/features/chat/chat-provider"
import { AddFromPlanDialog } from "@/features/list/add-from-plan-dialog"
import { useHouseholdInfo } from "@/features/settings/use-household"

import { AddEntryDialog } from "./add-entry-dialog"
import { today, weekLabel } from "./dates"
import { DayCard } from "./day-card"
import { EditEntryDialog } from "./edit-entry-dialog"
import { FillWeekDialog } from "./fill-week-dialog"
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
  const [filling, setFilling] = React.useState(false)
  useChatScreen({ kind: "week", weekStart: start, weekLabel: weekLabel(start) })

  function goTo(week: string) {
    setParams(
      (current) => {
        const next = new URLSearchParams(current)
        if (week === thisWeek) next.delete("week")
        else next.set("week", week)
        return next
      },
      { replace: true, preventScrollReset: true }
    )
  }

  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i))
  // The average over days with something counted, per person.
  const dayTotals = days
    .map((date) =>
      planTotals((plan.data ?? []).filter((entry) => entry.date === date))
    )
    .filter((totals) => totals.counted)
  const perDay = dayTotals.length
    ? Math.round(
        dayTotals.reduce((sum, totals) => sum + totals.calories, 0) /
          dayTotals.length
      )
    : null
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
        description={`${label ? `${label}, ` : ""}${weekLabel(start)}${perDay ? ` · planned meals average ${perDay.toLocaleString()} cal a day` : ""}`}
        actions={
          <>
            <Button
              variant="outline"
              disabled={!plan.data || !household.data}
              onClick={() => setFilling(true)}
            >
              <HugeiconsIcon
                icon={SparklesIcon}
                strokeWidth={2}
                data-icon="inline-start"
              />
              Fill the week
            </Button>
            <Button variant="outline" onClick={() => setListing(true)}>
              <HugeiconsIcon
                icon={ShoppingBasket01Icon}
                strokeWidth={2}
                data-icon="inline-start"
              />
              Add to list
            </Button>
          </>
        }
      />

      <div className="grid gap-4">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            aria-label="Previous week"
            onClick={() => goTo(addDays(start, -7))}
          >
            <HugeiconsIcon icon={ArrowLeft01Icon} strokeWidth={2} />
          </Button>
          <span className="min-w-32 text-center font-medium">
            {weekLabel(start)}
          </span>
          <Button
            variant="outline"
            size="icon"
            aria-label="Next week"
            onClick={() => goTo(addDays(start, 7))}
          >
            <HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={2} />
          </Button>
          {start !== thisWeek && (
            <Button variant="ghost" size="sm" onClick={() => goTo(thisWeek)}>
              This week
            </Button>
          )}
        </div>

        {plan.isPending || household.isPending ? (
          <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-36 rounded-2xl" />
            ))}
          </div>
        ) : plan.isError ? (
          <p className="text-muted-foreground">Couldn't load the plan.</p>
        ) : (
          // Like a paper planner: the week runs down each column, then across.
          <div className="gap-4 lg:columns-2 2xl:columns-3">
            {days.map((date) => (
              <div key={date} className="mb-4 break-inside-avoid">
                <DayCard
                  date={date}
                  isToday={date === now}
                  isPast={date < now}
                  meals={meals}
                  entries={plan.data.filter((entry) => entry.date === date)}
                  onAdd={(meal) => setAdding({ date, meal })}
                  onEdit={setEditing}
                />
              </div>
            ))}
          </div>
        )}
      </div>

      <AddEntryDialog slot={adding} onClose={() => setAdding(null)} />
      <FillWeekDialog
        open={filling}
        onOpenChange={setFilling}
        days={days}
        meals={meals}
        entries={plan.data ?? []}
      />
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
