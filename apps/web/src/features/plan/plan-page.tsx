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
  weekdayOf,
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
import { shortDayName, today, weekLabel } from "./dates"
import { DayCard } from "./day-card"
import { EditEntryDialog } from "./edit-entry-dialog"
import { FillWeekDialog } from "./fill-week-dialog"
import { findNextMeal, NextMealCard, useMinute } from "./next-meal"
import { usePlan } from "./use-plan"

/**
 * The week's meals: what's next, big, then a card for each day with its
 * meals side by side. Days gone by fold away. `?week=` holds the week's first day.
 */
export function PlanPage() {
  const household = useHouseholdInfo()
  const weekStart = household.data?.weekStart ?? 0
  const meals = household.data?.meals ?? DEFAULT_MEALS
  const [params, setParams] = useSearchParams()
  const minute = useMinute()
  const now = today()
  const thisWeek = startOfWeek(now, weekStart)
  const requested = isoDate.safeParse(params.get("week"))
  const start = requested.success
    ? startOfWeek(requested.data, weekStart)
    : thisWeek
  const end = addDays(start, 6)
  const plan = usePlan(start, end)
  // What's next can be in next week, so it looks a week ahead from today.
  const ahead = usePlan(now, addDays(now, 7))
  const [adding, setAdding] = React.useState<{
    date: string
    meal: Meal
  } | null>(null)
  const [editing, setEditing] = React.useState<PlanEntry | null>(null)
  const [listing, setListing] = React.useState(false)
  const [filling, setFilling] = React.useState(false)
  const [showPast, setShowPast] = React.useState(false)
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

  const entries = plan.data ?? []
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i))
  const isThisWeek = start === thisWeek
  // This week, days gone by fold into a line; other weeks show every day.
  const past = isThisWeek ? days.filter((date) => date < now) : []
  const next = isThisWeek ? findNextMeal(ahead.data ?? [], minute) : null
  const label = isThisWeek
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
            <Button onClick={() => setListing(true)}>
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

      <div className="grid gap-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              className="rounded-full"
              aria-label="Previous week"
              onClick={() => goTo(addDays(start, -7))}
            >
              <HugeiconsIcon icon={ArrowLeft01Icon} strokeWidth={2} />
            </Button>
            <span className="min-w-28 text-center font-semibold">
              {weekLabel(start)}
            </span>
            <Button
              variant="outline"
              size="icon"
              className="rounded-full"
              aria-label="Next week"
              onClick={() => goTo(addDays(start, 7))}
            >
              <HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={2} />
            </Button>
            {!isThisWeek && (
              <Button variant="ghost" size="sm" onClick={() => goTo(thisWeek)}>
                This week
              </Button>
            )}
          </div>
          {plan.data && (
            <WeekSummary
              days={days}
              meals={meals}
              entries={entries}
              onList={() => setListing(true)}
            />
          )}
        </div>

        {next && <NextMealCard entry={next} onEdit={() => setEditing(next)} />}

        {plan.isPending || household.isPending ? (
          <div className="grid gap-4">
            {Array.from({ length: 3 }, (_, i) => (
              <Skeleton key={i} className="h-36 rounded-3xl" />
            ))}
          </div>
        ) : plan.isError ? (
          <p className="text-muted-foreground">Couldn't load the plan.</p>
        ) : (
          <>
            {past.length > 0 && (
              <PastDays
                days={past}
                entries={entries.filter((entry) => entry.date < now)}
                open={showPast}
                onToggle={() => setShowPast((open) => !open)}
              />
            )}
            {days
              .filter((date) => showPast || !past.includes(date))
              .map((date) => (
                <DayCard
                  key={date}
                  date={date}
                  isToday={date === now}
                  isPast={date < now}
                  meals={meals}
                  entries={entries.filter((entry) => entry.date === date)}
                  onAdd={(meal) => setAdding({ date, meal })}
                  onEdit={setEditing}
                  theme={
                    meals.includes("dinner")
                      ? (household.data?.themes[weekdayOf(date)] ?? null)
                      : null
                  }
                />
              ))}
          </>
        )}
      </div>

      <AddEntryDialog slot={adding} onClose={() => setAdding(null)} />
      <FillWeekDialog
        open={filling}
        onOpenChange={setFilling}
        days={days}
        meals={meals}
        entries={entries}
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

/** How full the week is, what still needs adding to the list, and calories a day. */
function WeekSummary({
  days,
  meals,
  entries,
  onList,
}: {
  days: string[]
  meals: Meal[]
  entries: PlanEntry[]
  onList: () => void
}) {
  const now = today()
  const filled = new Set(
    entries
      .filter((entry) => meals.includes(entry.meal))
      .map((entry) => `${entry.date}|${entry.meal}`)
  ).size
  const coming = entries.filter(
    (entry) => entry.recipe && entry.status === "planned" && entry.date >= now
  )
  const unlisted = coming.filter((entry) => !entry.listed).length
  // The average over days with something counted, per person.
  const dayTotals = days
    .map((date) => planTotals(entries.filter((entry) => entry.date === date)))
    .filter((totals) => totals.counted)
  const perDay = dayTotals.length
    ? Math.round(
        dayTotals.reduce((sum, totals) => sum + totals.calories, 0) /
          dayTotals.length
      )
    : null
  const chip = "rounded-full bg-secondary px-3 py-1 text-sm"

  return (
    <div className="flex flex-wrap gap-1.5">
      <span className={chip}>
        <strong className="font-semibold">{filled}</strong> of{" "}
        {meals.length * days.length} meals planned
      </span>
      {unlisted > 0 ? (
        <button
          type="button"
          onClick={onList}
          className={`${chip} font-medium text-primary transition-colors outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50`}
        >
          {unlisted} not on the list yet
        </button>
      ) : (
        coming.length > 0 && <span className={chip}>All on the list</span>
      )}
      {perDay && (
        <span className={chip}>
          ≈ <strong className="font-semibold">{perDay.toLocaleString()}</strong>{" "}
          cal a day
        </span>
      )}
    </div>
  )
}

/** This week's days gone by, folded into one line until they're wanted. */
function PastDays({
  days,
  entries,
  open,
  onToggle,
}: {
  days: string[]
  entries: PlanEntry[]
  open: boolean
  onToggle: () => void
}) {
  const range =
    days.length > 1
      ? `${shortDayName(days[0]!)} – ${shortDayName(days.at(-1)!)}`
      : shortDayName(days[0]!)
  const cooked = entries.filter((entry) => entry.status === "cooked")
  const names = cooked.map((entry) => entry.recipe?.name ?? entry.note)
  const summary = cooked.length
    ? `${cooked.length} cooked: ${names.join(", ")}`
    : entries.length
      ? `${entries.length} planned, none marked cooked`
      : "Nothing was planned"

  return (
    <button
      type="button"
      aria-expanded={open}
      onClick={onToggle}
      className="flex items-center justify-between gap-4 rounded-3xl border bg-muted/40 px-5 py-3.5 text-left transition-colors outline-none hover:bg-muted/70 focus-visible:ring-[3px] focus-visible:ring-ring/50 md:px-6"
    >
      <span className="min-w-0 truncate text-muted-foreground">
        <span className="font-semibold text-foreground">{range}</span> ·{" "}
        {summary}
      </span>
      <span className="shrink-0 text-sm font-semibold text-primary">
        {open ? "Hide" : "Show"}
      </span>
    </button>
  )
}
