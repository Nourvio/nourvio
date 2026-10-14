import { MEAL_NAMES, MEALS, type Meal } from "@mise/shared"
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
import { Skeleton } from "@/components/ui/skeleton"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { ApiError } from "@/lib/api"

import { useHouseholdInfo, useUpdateHousehold } from "./use-household"

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
          </FieldGroup>
        )}
      </CardContent>
    </Card>
  )
}
