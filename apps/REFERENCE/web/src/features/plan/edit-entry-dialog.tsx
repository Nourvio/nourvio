import * as React from "react"
import { addDays, MEAL_NAMES, type Meal, type PlanEntry } from "@mise/shared"
import { toast } from "sonner"

import { ResponsiveDialog } from "@/components/responsive-dialog"
import { Button } from "@/components/ui/button"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Spinner } from "@/components/ui/spinner"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { ServingsStepper } from "@/features/recipes/servings-stepper"
import { ApiError } from "@/lib/api"

import { monthDay, shortDayName } from "./dates"
import { useUpdatePlanEntry } from "./use-plan"

/** Move an entry to another day or meal, or change how many it serves. */
export function EditEntryDialog({
  entry,
  meals,
  onClose,
}: {
  entry: PlanEntry | null
  meals: Meal[]
  onClose: () => void
}) {
  return (
    <ResponsiveDialog
      open={entry !== null}
      onOpenChange={(open) => !open && onClose()}
      title={entry?.recipe?.name ?? entry?.note ?? "Edit"}
    >
      {entry && <EditEntry entry={entry} meals={meals} onDone={onClose} />}
    </ResponsiveDialog>
  )
}

function EditEntry({
  entry,
  meals,
  onDone,
}: {
  entry: PlanEntry
  meals: Meal[]
  onDone: () => void
}) {
  const update = useUpdatePlanEntry()
  const base = entry.recipe?.servings ?? null
  const [date, setDate] = React.useState(entry.date)
  const [meal, setMeal] = React.useState<Meal>(entry.meal)
  const [servings, setServings] = React.useState(entry.servings ?? base)
  // A meal that's been turned off since still shows, so it can be moved out.
  const mealChoices = meals.includes(entry.meal)
    ? meals
    : [entry.meal, ...meals]
  // Two weeks either side of where it is now.
  const days = Array.from({ length: 29 }, (_, i) => addDays(entry.date, i - 14))

  function save(event: React.FormEvent) {
    event.preventDefault()
    update.mutate(
      {
        id: entry.id,
        date,
        meal,
        servings: base && servings !== base ? servings : null,
      },
      {
        onSuccess: () => {
          toast.success("Plan updated")
          onDone()
        },
        onError: (error) =>
          toast.error(
            error instanceof ApiError ? error.message : "Couldn't save that"
          ),
      }
    )
  }

  return (
    <form className="grid gap-5" onSubmit={save}>
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="entry-day">Day</FieldLabel>
          <Select value={date} onValueChange={setDate}>
            <SelectTrigger id="entry-day" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {days.map((day) => (
                <SelectItem key={day} value={day}>
                  {shortDayName(day)}, {monthDay(day)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field>
          <FieldLabel>Meal</FieldLabel>
          <ToggleGroup
            type="single"
            variant="outline"
            value={meal}
            onValueChange={(value) => value && setMeal(value as Meal)}
            className="flex-wrap justify-start"
          >
            {mealChoices.map((choice) => (
              <ToggleGroupItem key={choice} value={choice}>
                {MEAL_NAMES[choice]}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </Field>
        {base && (
          <Field>
            <FieldLabel>Servings</FieldLabel>
            <ServingsStepper
              baseServings={base}
              factor={(servings ?? base) / base}
              onChange={(factor) =>
                setServings(Math.round(base * factor * 100) / 100)
              }
            />
          </Field>
        )}
      </FieldGroup>
      <Button type="submit" disabled={update.isPending}>
        {update.isPending && <Spinner data-icon="inline-start" />}
        Save
      </Button>
    </form>
  )
}
