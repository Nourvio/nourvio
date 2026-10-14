import * as React from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import { Calendar03Icon } from "@hugeicons/core-free-icons"
import {
  addDays,
  DEFAULT_MEALS,
  MEAL_NAMES,
  type Meal,
  type Recipe,
} from "@mise/shared"
import { useNavigate } from "react-router"
import { toast } from "sonner"

import { ResponsiveDialog } from "@/components/responsive-dialog"
import { Button } from "@/components/ui/button"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Spinner } from "@/components/ui/spinner"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { ServingsStepper } from "@/features/recipes/servings-stepper"
import { useHouseholdInfo } from "@/features/settings/use-household"
import { ApiError } from "@/lib/api"
import { cn } from "@/lib/utils"

import { dayInSentence, fromIsoDate, shortDayName, today } from "./dates"
import { useAddPlanEntry } from "./use-plan"

/** The recipe page's "Add to plan": pick a day and meal in the next two weeks. */
export function AddToPlanButton({
  recipe,
  factor,
}: {
  recipe: Recipe
  factor: number
}) {
  const [open, setOpen] = React.useState(false)
  return (
    <>
      <Button size="lg" variant="outline" onClick={() => setOpen(true)}>
        <HugeiconsIcon
          icon={Calendar03Icon}
          strokeWidth={2}
          data-icon="inline-start"
        />
        Plan
      </Button>
      <ResponsiveDialog
        open={open}
        onOpenChange={setOpen}
        title={`Plan ${recipe.name}`}
      >
        {open && (
          <AddToPlan
            recipe={recipe}
            factor={factor}
            onDone={() => setOpen(false)}
          />
        )}
      </ResponsiveDialog>
    </>
  )
}

function AddToPlan({
  recipe,
  factor,
  onDone,
}: {
  recipe: Recipe
  factor: number
  onDone: () => void
}) {
  const navigate = useNavigate()
  const household = useHouseholdInfo()
  const meals = household.data?.meals ?? DEFAULT_MEALS
  const now = today()
  const days = Array.from({ length: 14 }, (_, i) => addDays(now, i))
  const [date, setDate] = React.useState(now)
  const [meal, setMeal] = React.useState<Meal>(
    meals.includes("dinner") ? "dinner" : meals[0]!
  )
  const [scale, setScale] = React.useState(factor)
  const add = useAddPlanEntry()
  const base = recipe.servings

  function save() {
    add.mutate(
      {
        date,
        meal,
        recipeId: recipe.id,
        servings:
          base && scale !== 1 ? Math.round(base * scale * 100) / 100 : null,
      },
      {
        onSuccess: () => {
          toast.success(`Planned for ${dayInSentence(date)}`, {
            action: {
              label: "See the plan",
              onClick: () => navigate(`/plan?week=${date}`),
            },
          })
          onDone()
        },
        onError: (error) =>
          toast.error(
            error instanceof ApiError ? error.message : "Couldn't plan that"
          ),
      }
    )
  }

  return (
    <div className="grid gap-5">
      <FieldGroup>
        <Field>
          <FieldLabel>Day</FieldLabel>
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
            {days.map((day) => (
              <button
                key={day}
                type="button"
                aria-pressed={day === date}
                onClick={() => setDate(day)}
                className={cn(
                  "grid justify-items-center gap-0.5 rounded-xl border px-1 py-2 text-sm transition-colors hover:bg-muted focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none",
                  day === date &&
                    "border-primary bg-primary text-primary-foreground hover:bg-primary"
                )}
              >
                <span className="text-xs">
                  {day === now ? "Today" : shortDayName(day)}
                </span>
                <span className="font-medium">
                  {fromIsoDate(day).getDate()}
                </span>
              </button>
            ))}
          </div>
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
            {meals.map((choice) => (
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
              factor={scale}
              onChange={setScale}
            />
          </Field>
        )}
      </FieldGroup>
      <Button disabled={add.isPending} onClick={save}>
        {add.isPending && <Spinner data-icon="inline-start" />}
        Add to {dayInSentence(date)}&rsquo;s {MEAL_NAMES[meal].toLowerCase()}
      </Button>
    </div>
  )
}
