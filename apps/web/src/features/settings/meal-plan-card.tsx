import { MEAL_NAMES, MEALS, type AutoPlan, type Meal } from "@mise/shared"
import { toast } from "sonner"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { weekLabel } from "@/features/plan/dates"
import { ApiError } from "@/lib/api"

import {
  useHouseholdInfo,
  useRunAutoPlan,
  useSaveAutoPlan,
  useUpdateHousehold,
} from "./use-household"

/** Household admins: which meals the plan shows, and when the week starts. */
export function MealPlanCard() {
  const household = useHouseholdInfo()
  const update = useUpdateHousehold()

  function save(input: { meals?: Meal[]; weekStart?: 0 | 1 }) {
    update.mutate(input, {
      onSuccess: () => toast.success("Meal plan updated"),
      onError: (error) =>
        toast.error(
          error instanceof ApiError ? error.message : "Couldn't save that"
        ),
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Meal plan</CardTitle>
        <CardDescription>
          Every meal is optional: plan only what you want to.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!household.data ? (
          <Skeleton className="h-24" />
        ) : (
          <FieldGroup>
            <Field>
              <FieldLabel>Meals to show</FieldLabel>
              <ToggleGroup
                type="multiple"
                variant="outline"
                value={household.data.meals}
                onValueChange={(value) => {
                  // Keep at least one; an empty plan has nowhere to add to.
                  if (value.length) save({ meals: value as Meal[] })
                }}
                className="flex-wrap justify-start"
                disabled={update.isPending}
              >
                {MEALS.map((meal) => (
                  <ToggleGroupItem key={meal} value={meal}>
                    {MEAL_NAMES[meal]}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
              <FieldDescription>
                Hidden meals keep anything already planned in them.
              </FieldDescription>
            </Field>
            <Field>
              <FieldLabel>Week starts on</FieldLabel>
              <ToggleGroup
                type="single"
                variant="outline"
                value={String(household.data.weekStart)}
                onValueChange={(value) =>
                  value && save({ weekStart: Number(value) as 0 | 1 })
                }
                className="justify-start"
                disabled={update.isPending}
              >
                <ToggleGroupItem value="0">Sunday</ToggleGroupItem>
                <ToggleGroupItem value="1">Monday</ToggleGroupItem>
              </ToggleGroup>
            </Field>
            <AutoPlanField autoPlan={household.data.autoPlan} />
          </FieldGroup>
        )}
      </CardContent>
    </Card>
  )
}

const DAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
]
const HOUR = new Intl.DateTimeFormat(undefined, { hour: "numeric" })
const hourName = (hour: number) => HOUR.format(new Date(2026, 0, 1, hour))
const timeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone

/** Planning the week ahead by itself, on a day and time the household picks. */
function AutoPlanField({ autoPlan }: { autoPlan: AutoPlan }) {
  const save = useSaveAutoPlan()
  const run = useRunAutoPlan()

  function change(next: Partial<AutoPlan>, message: string) {
    save.mutate(
      {
        enabled: next.enabled ?? autoPlan.enabled,
        day: next.day ?? autoPlan.day,
        hour: next.hour ?? autoPlan.hour,
        addToList: next.addToList ?? autoPlan.addToList,
        timeZone: timeZone(),
      },
      {
        onSuccess: () => toast.success(message),
        onError: (error) =>
          toast.error(
            error instanceof ApiError ? error.message : "Couldn't save that"
          ),
      }
    )
  }

  const last = autoPlan.last
  const busy = save.isPending || run.isPending
  return (
    <Field>
      <FieldLabel>Plan the week for me</FieldLabel>
      <div className="flex flex-wrap items-center gap-2">
        <Checkbox
          id="autoplan"
          checked={autoPlan.enabled}
          disabled={busy}
          onCheckedChange={(checked) =>
            change(
              { enabled: checked === true },
              checked === true
                ? `The week ahead will be planned every ${DAYS[autoPlan.day]}`
                : "Mise won't plan the week by itself"
            )
          }
        />
        <Label htmlFor="autoplan" className="font-normal">
          Every
        </Label>
        <Select
          value={String(autoPlan.day)}
          disabled={busy}
          onValueChange={(day) =>
            change({ day: Number(day) }, `Planning on ${DAYS[Number(day)]}s`)
          }
        >
          <SelectTrigger className="w-32" aria-label="Day">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {DAYS.map((name, day) => (
              <SelectItem key={name} value={String(day)}>
                {name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-sm">at</span>
        <Select
          value={String(autoPlan.hour)}
          disabled={busy}
          onValueChange={(hour) =>
            change(
              { hour: Number(hour) },
              `Planning at ${hourName(Number(hour))}`
            )
          }
        >
          <SelectTrigger className="w-28" aria-label="Time">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Array.from({ length: 24 }, (_, hour) => (
              <SelectItem key={hour} value={String(hour)}>
                {hourName(hour)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex items-center gap-2">
        <Checkbox
          id="autoplan-list"
          checked={autoPlan.addToList}
          disabled={busy}
          onCheckedChange={(checked) =>
            change(
              { addToList: checked === true },
              checked === true
                ? "The meals will go on the list too"
                : "The list is left for you"
            )
          }
        />
        <Label htmlFor="autoplan-list" className="font-normal">
          Add the meals to the shopping list too
        </Label>
      </div>
      <FieldDescription>
        Fills the week ahead's empty meals by your rules and tastes, the same
        way Fill the week does, and leaves anything already planned alone.
        {last
          ? ` Last planned ${weekLabel(last.week)}: ${last.planned} of ${last.empty} meals${last.listed ? `, ${last.listed} on the list` : ""}.`
          : ""}
      </FieldDescription>
      <div>
        <Button
          variant="outline"
          disabled={busy}
          onClick={() =>
            run.mutate(undefined, {
              onSuccess: ({ run: result }) =>
                toast.success(
                  `Planned ${weekLabel(result.week)}: ${result.planned} ${result.planned === 1 ? "meal" : "meals"}${result.listed ? `, ${result.listed} on the list` : ""}`
                ),
              onError: (error) =>
                toast.error(
                  error instanceof ApiError
                    ? error.message
                    : "Couldn't plan the week"
                ),
            })
          }
        >
          {run.isPending && <Spinner data-icon="inline-start" />}
          Plan the week ahead now
        </Button>
      </div>
    </Field>
  )
}
