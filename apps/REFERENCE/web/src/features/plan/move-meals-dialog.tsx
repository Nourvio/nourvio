import * as React from "react"
import { addDays, MEAL_NAMES, type Meal } from "@mise/shared"

import { ResponsiveDialog } from "@/components/responsive-dialog"
import { cn } from "@/lib/utils"

import { monthDay, shortDayName, today, weekLabel } from "./dates"

/**
 * Which day selected meals move to, in the week shown or the one after;
 * they keep their meal unless another is picked.
 */
export function MoveMealsDialog({
  count,
  start,
  meals,
  open,
  onOpenChange,
  onPick,
}: {
  count: number
  /** The first day of the week shown. */
  start: string
  meals: Meal[]
  open: boolean
  onOpenChange: (open: boolean) => void
  onPick: (date: string, meal?: Meal) => void
}) {
  const [meal, setMeal] = React.useState<Meal | null>(null)
  const now = today()
  const chip = (on: boolean) =>
    cn(
      "rounded-full border px-3 py-1 text-sm font-medium outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
      on
        ? "border-primary bg-primary text-primary-foreground"
        : "hover:bg-secondary"
    )

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Move ${count === 1 ? "this meal" : `these ${count} meals`}`}
      description="Pick a day. They stay the same meal unless you change it."
    >
      <div className="grid gap-5">
        <div
          role="group"
          aria-label="Meal"
          className="flex flex-wrap items-center gap-1.5"
        >
          <button
            type="button"
            aria-pressed={meal === null}
            className={chip(meal === null)}
            onClick={() => setMeal(null)}
          >
            Same meal
          </button>
          {meals.map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={meal === option}
              className={chip(meal === option)}
              onClick={() => setMeal(option)}
            >
              {MEAL_NAMES[option]}
            </button>
          ))}
        </div>
        {[0, 7].map((offset) => (
          <div key={offset} className="grid gap-2">
            <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              {weekLabel(addDays(start, offset))}
            </p>
            <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-7">
              {Array.from({ length: 7 }, (_, i) =>
                addDays(start, offset + i)
              ).map((date) => (
                <button
                  key={date}
                  type="button"
                  onClick={() => onPick(date, meal ?? undefined)}
                  className={cn(
                    "grid rounded-2xl border px-2 py-2 text-center text-sm font-medium outline-none hover:bg-secondary focus-visible:ring-[3px] focus-visible:ring-ring/50",
                    date === now && "border-primary",
                    date < now && "text-muted-foreground"
                  )}
                >
                  {shortDayName(date)}
                  <span className="text-xs font-normal text-muted-foreground">
                    {monthDay(date)}
                  </span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </ResponsiveDialog>
  )
}
