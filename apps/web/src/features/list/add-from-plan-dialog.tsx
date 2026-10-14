import * as React from "react"
import { addDays, startOfWeek } from "@mise/shared"
import { toast } from "sonner"

import { ResponsiveDialog } from "@/components/responsive-dialog"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { today, weekLabel } from "@/features/plan/dates"
import { usePlan } from "@/features/plan/use-plan"
import { useHouseholdInfo } from "@/features/settings/use-household"
import { ApiError } from "@/lib/api"

import { useAddFromPlan } from "./use-list"

/** Puts a week's planned meals (the ones not already added) on the list. */
export function AddFromPlanDialog({
  open,
  onOpenChange,
  initialWeek,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The week to start on; this week by default. */
  initialWeek?: string
}) {
  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Add from the plan"
      description="Ingredients from planned meals, combined, plus your every-week items."
    >
      {open && (
        <AddFromPlan
          initialWeek={initialWeek}
          onDone={() => onOpenChange(false)}
        />
      )}
    </ResponsiveDialog>
  )
}

function AddFromPlan({
  initialWeek,
  onDone,
}: {
  initialWeek?: string
  onDone: () => void
}) {
  const household = useHouseholdInfo()
  const weekStart = household.data?.weekStart ?? 0
  const thisWeek = startOfWeek(today(), weekStart)
  const [start, setStart] = React.useState(initialWeek ?? thisWeek)
  const end = addDays(start, 6)
  const plan = usePlan(start, end)
  const add = useAddFromPlan()

  const pending = (plan.data ?? []).filter(
    (entry) => entry.recipe && entry.status === "planned" && !entry.listed
  )
  const listed = (plan.data ?? []).filter((entry) => entry.listed).length

  function run() {
    add.mutate(
      { from: start, to: end },
      {
        onSuccess: (result) => {
          const parts = [
            result.added + result.merged > 0 &&
              `${result.added + result.merged} ingredients from ${result.meals} ${result.meals === 1 ? "meal" : "meals"}`,
            result.weekly > 0 &&
              `${result.weekly} every-week ${result.weekly === 1 ? "item" : "items"}`,
          ].filter(Boolean)
          toast.success(
            parts.length
              ? `Added ${parts.join(" and ")}`
              : "Nothing new to add",
            {
              description: result.onHand.length
                ? `Left out ${result.onHand.join(", ").toLowerCase()}: always on hand.`
                : undefined,
            }
          )
          onDone()
        },
        onError: (error) =>
          toast.error(
            error instanceof ApiError ? error.message : "Couldn't add those"
          ),
      }
    )
  }

  return (
    <div className="grid gap-5">
      <ToggleGroup
        type="single"
        variant="outline"
        value={start}
        onValueChange={(value) => value && setStart(value)}
        className="w-full"
      >
        <ToggleGroupItem value={thisWeek} className="flex-1">
          This week
        </ToggleGroupItem>
        <ToggleGroupItem value={addDays(thisWeek, 7)} className="flex-1">
          Next week
        </ToggleGroupItem>
      </ToggleGroup>

      <div className="rounded-xl bg-muted/60 p-4 text-sm">
        <p className="font-medium">{weekLabel(start)}</p>
        {plan.isPending ? (
          <p className="text-muted-foreground">Checking the plan…</p>
        ) : pending.length ? (
          <ul className="mt-2 grid gap-1 text-muted-foreground">
            {pending.map((entry) => (
              <li key={entry.id} className="truncate">
                {entry.recipe!.name}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground">
            {listed
              ? "Everything planned is on the list already."
              : "No recipes planned yet."}
          </p>
        )}
      </div>

      <Button disabled={add.isPending || plan.isPending} onClick={run}>
        {add.isPending && <Spinner data-icon="inline-start" />}
        {pending.length
          ? `Add ${pending.length} ${pending.length === 1 ? "meal" : "meals"}`
          : "Add every-week items"}
      </Button>
    </div>
  )
}
