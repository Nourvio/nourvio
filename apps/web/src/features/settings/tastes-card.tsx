import * as React from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import { Add01Icon, Cancel01Icon } from "@hugeicons/core-free-icons"
import {
  DIET_NAMES,
  DIETS,
  NO_TASTES,
  SALE_LEAN_NAMES,
  SALE_LEANS,
  WEEKNIGHT_MINUTES,
  type Diet,
  type HouseholdTastes,
  type SaleLean,
} from "@mise/shared"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { ApiError } from "@/lib/api"

import { useHouseholdInfo, useUpdateTastes } from "./use-household"

/**
 * What the household eats and doesn't. Fill the week, dinner ideas and the
 * assistant follow it. Anyone in the household can change it.
 */
export function TastesCard() {
  const household = useHouseholdInfo()
  const update = useUpdateTastes()
  const tastes = household.data?.tastes ?? NO_TASTES

  function save(change: Partial<HouseholdTastes>, message: string) {
    update.mutate(
      { ...tastes, ...change },
      {
        onSuccess: () => toast.success(message),
        onError: (error) =>
          toast.error(
            error instanceof ApiError ? error.message : "Couldn't save that"
          ),
      }
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Tastes and rules</CardTitle>
        <CardDescription>
          What your household eats and doesn't. Fill the week, dinner ideas and
          the assistant follow these, and recipes that break one say so.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!household.data ? (
          <Skeleton className="h-40" />
        ) : (
          <FieldGroup>
            <Field>
              <FieldLabel>Foods to avoid</FieldLabel>
              {tastes.avoid.length > 0 && (
                <ul className="flex flex-wrap gap-2">
                  {tastes.avoid.map((item, index) => (
                    <li
                      key={`${item.food}-${item.who}`}
                      className="inline-flex items-center gap-1.5 rounded-full border bg-card py-1 pr-1 pl-3 text-sm"
                    >
                      <span className="first-letter:uppercase">
                        {item.food}
                      </span>
                      {item.who && (
                        <span className="text-muted-foreground">
                          · {item.who}
                        </span>
                      )}
                      {item.allergy && (
                        <Badge variant="destructive" className="h-5">
                          Allergy
                        </Badge>
                      )}
                      <button
                        type="button"
                        disabled={update.isPending}
                        aria-label={`Stop avoiding ${item.food}`}
                        onClick={() =>
                          save(
                            {
                              avoid: tastes.avoid.filter((_, i) => i !== index),
                            },
                            `Removed ${item.food}`
                          )
                        }
                        className="flex size-6 items-center justify-center rounded-full hover:bg-foreground/10"
                      >
                        <HugeiconsIcon
                          icon={Cancel01Icon}
                          strokeWidth={2}
                          className="size-3.5"
                        />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <AddAvoided
                disabled={update.isPending}
                onAdd={(item) =>
                  save(
                    { avoid: [...tastes.avoid, item] },
                    item.allergy
                      ? `Noted the ${item.food} allergy`
                      : `Added ${item.food}`
                  )
                }
              />
              <FieldDescription>
                "Nuts", "dairy", "gluten", "eggs" and "meat" use the same
                careful check as the diet labels (pesto has nuts, butter is
                dairy).
              </FieldDescription>
            </Field>

            <Field>
              <FieldLabel>Every meal must be</FieldLabel>
              <ToggleGroup
                type="multiple"
                variant="outline"
                value={tastes.diets}
                onValueChange={(value) =>
                  save({ diets: value as Diet[] }, "Diets updated")
                }
                className="flex-wrap justify-start"
                disabled={update.isPending}
              >
                {DIETS.map((diet) => (
                  <ToggleGroupItem key={diet} value={diet}>
                    {DIET_NAMES[diet]}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </Field>

            <Field>
              <FieldLabel>Weeknight dinners, Monday to Thursday</FieldLabel>
              <ToggleGroup
                type="single"
                variant="outline"
                value={String(tastes.weeknightMinutes ?? "any")}
                onValueChange={(value) =>
                  value &&
                  save(
                    {
                      weeknightMinutes: value === "any" ? null : Number(value),
                    },
                    "Weeknight dinners updated"
                  )
                }
                className="flex-wrap justify-start"
                disabled={update.isPending}
              >
                <ToggleGroupItem value="any">Any length</ToggleGroupItem>
                {WEEKNIGHT_MINUTES.map((minutes) => (
                  <ToggleGroupItem key={minutes} value={String(minutes)}>
                    {minutes === 60
                      ? "Under an hour"
                      : `${minutes} min or less`}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </Field>

            <Field>
              <FieldLabel>Lean on sales</FieldLabel>
              <ToggleGroup
                type="single"
                variant="outline"
                value={tastes.sales}
                onValueChange={(value) =>
                  value &&
                  save({ sales: value as SaleLean }, "Sales setting updated")
                }
                className="flex-wrap justify-start"
                disabled={update.isPending}
              >
                {SALE_LEANS.map((lean) => (
                  <ToggleGroupItem key={lean} value={lean}>
                    {SALE_LEAN_NAMES[lean]}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
              <FieldDescription>
                Fill the week and the weekly autopilot favor recipes whose meat,
                fish or produce is on sale at your Fry's, and say so. A little
                still puts your favorites first.
              </FieldDescription>
            </Field>

            <Field>
              <FieldLabel>Notes for the assistant</FieldLabel>
              {tastes.notes.length > 0 && (
                <ul className="grid gap-1.5">
                  {tastes.notes.map((note, index) => (
                    <li
                      key={note}
                      className="flex items-center gap-2 rounded-xl border bg-card py-1.5 pr-1.5 pl-3 text-sm"
                    >
                      <span className="min-w-0 flex-1">{note}</span>
                      <button
                        type="button"
                        disabled={update.isPending}
                        aria-label={`Remove "${note}"`}
                        onClick={() =>
                          save(
                            {
                              notes: tastes.notes.filter((_, i) => i !== index),
                            },
                            "Note removed"
                          )
                        }
                        className="flex size-6 shrink-0 items-center justify-center rounded-full hover:bg-foreground/10"
                      >
                        <HugeiconsIcon
                          icon={Cancel01Icon}
                          strokeWidth={2}
                          className="size-3.5"
                        />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <AddNote
                disabled={update.isPending}
                onAdd={(note) =>
                  save({ notes: [...tastes.notes, note] }, "Note added")
                }
              />
              <FieldDescription>
                Things the assistant should keep in mind, like "no fish on
                Mondays" or "the kids like it mild".
              </FieldDescription>
            </Field>
          </FieldGroup>
        )}
      </CardContent>
    </Card>
  )
}

function AddAvoided({
  disabled,
  onAdd,
}: {
  disabled: boolean
  onAdd: (item: HouseholdTastes["avoid"][number]) => void
}) {
  const [food, setFood] = React.useState("")
  const [who, setWho] = React.useState("")
  const [allergy, setAllergy] = React.useState(false)
  const id = React.useId()
  return (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={(event) => {
        event.preventDefault()
        if (!food.trim()) return
        onAdd({
          food: food.trim().toLowerCase(),
          who: who.trim() || null,
          allergy,
        })
        setFood("")
        setWho("")
        setAllergy(false)
      }}
    >
      <Input
        value={food}
        onChange={(event) => setFood(event.target.value)}
        placeholder="A food, like mushrooms"
        aria-label="Food to avoid"
        maxLength={60}
        className="min-w-40 flex-1"
      />
      <Input
        value={who}
        onChange={(event) => setWho(event.target.value)}
        placeholder="Who (optional)"
        aria-label="Who doesn't eat it"
        maxLength={40}
        className="w-36"
      />
      <div className="flex items-center gap-2 px-1">
        <Checkbox
          id={`${id}-allergy`}
          checked={allergy}
          onCheckedChange={(checked) => setAllergy(checked === true)}
        />
        <Label htmlFor={`${id}-allergy`} className="font-normal">
          Allergy
        </Label>
      </div>
      <Button
        type="submit"
        variant="outline"
        disabled={disabled || !food.trim()}
      >
        <HugeiconsIcon
          icon={Add01Icon}
          strokeWidth={2}
          data-icon="inline-start"
        />
        Add
      </Button>
    </form>
  )
}

function AddNote({
  disabled,
  onAdd,
}: {
  disabled: boolean
  onAdd: (note: string) => void
}) {
  const [note, setNote] = React.useState("")
  return (
    <form
      className="flex gap-2"
      onSubmit={(event) => {
        event.preventDefault()
        if (!note.trim()) return
        onAdd(note.trim())
        setNote("")
      }}
    >
      <Input
        value={note}
        onChange={(event) => setNote(event.target.value)}
        placeholder="No fish on Mondays"
        aria-label="A note for the assistant"
        maxLength={200}
      />
      <Button
        type="submit"
        variant="outline"
        disabled={disabled || !note.trim()}
      >
        Add
      </Button>
    </form>
  )
}
