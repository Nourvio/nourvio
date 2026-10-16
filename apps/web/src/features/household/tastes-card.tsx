import { Add01Icon, Cancel01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  DIETS,
  NO_TASTES,
  WEEKNIGHT_MINUTES,
  type Diet,
  type HouseholdTastes,
} from "@merran/shared"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import * as React from "react"
import { useTranslation } from "react-i18next"
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
import { api, ApiError, unwrap } from "@/lib/api/client"

import { tastesQuery } from "./queries"

type Avoided = HouseholdTastes["avoid"][number]

/**
 * Settings → Household → Tastes: what the household eats and doesn't, which
 * Fill the week keeps to. Anyone in the household can change it, and each
 * change saves straight away.
 */
export function TastesCard() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const { data } = useQuery(tastesQuery)
  const [busy, setBusy] = React.useState(false)
  const tastes = data ?? NO_TASTES

  async function save(change: Partial<HouseholdTastes>) {
    setBusy(true)
    try {
      queryClient.setQueryData(
        tastesQuery.queryKey,
        await unwrap(
          api.PUT("/api/households/current/tastes", {
            body: { ...tastes, ...change },
          })
        )
      )
      toast.success(t("settings.household.tastes.saved"))
    } catch (err) {
      if (!(err instanceof ApiError)) throw err
      toast.error(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("settings.household.tastes.title")}</CardTitle>
        <CardDescription>
          {t("settings.household.tastes.description")}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!data ? (
          <Skeleton className="h-40" />
        ) : (
          <FieldGroup>
            <Field>
              <FieldLabel>{t("settings.household.tastes.avoid")}</FieldLabel>
              {tastes.avoid.length > 0 && (
                <ul className="flex flex-wrap gap-2">
                  {tastes.avoid.map((item, index) => (
                    <li
                      key={item.food}
                      className="inline-flex items-center gap-1.5 rounded-full border bg-card py-1 pr-1 pl-3 text-sm"
                    >
                      <span className="first-letter:uppercase">
                        {item.food}
                      </span>
                      {item.allergy && (
                        <Badge variant="destructive" className="h-5">
                          {t("settings.household.tastes.allergy")}
                        </Badge>
                      )}
                      <button
                        type="button"
                        disabled={busy}
                        aria-label={t(
                          "settings.household.tastes.stopAvoiding",
                          {
                            food: item.food,
                          }
                        )}
                        onClick={() =>
                          void save({
                            avoid: tastes.avoid.filter((_, i) => i !== index),
                          })
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
                disabled={busy}
                onAdd={(item) => save({ avoid: [...tastes.avoid, item] })}
              />
              <FieldDescription>
                {t("settings.household.tastes.avoidHint")}
              </FieldDescription>
            </Field>

            <Field>
              <FieldLabel>{t("settings.household.tastes.diets")}</FieldLabel>
              <ToggleGroup
                multiple
                variant="outline"
                size="sm"
                value={tastes.diets}
                onValueChange={(value) => void save({ diets: value as Diet[] })}
                disabled={busy}
                className="flex-wrap justify-start"
              >
                {DIETS.map((diet) => (
                  <ToggleGroupItem key={diet} value={diet}>
                    {t(`recipes.diets.names.${diet}`)}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </Field>

            <Field>
              <FieldLabel>
                {t("settings.household.tastes.weeknight")}
              </FieldLabel>
              <ToggleGroup
                variant="outline"
                size="sm"
                value={[String(tastes.weeknightMinutes ?? "any")]}
                onValueChange={(value) => {
                  const next = value[0]
                  if (next)
                    void save({
                      weeknightMinutes: next === "any" ? null : Number(next),
                    })
                }}
                disabled={busy}
                className="flex-wrap justify-start"
              >
                <ToggleGroupItem value="any">
                  {t("settings.household.tastes.anyLength")}
                </ToggleGroupItem>
                {WEEKNIGHT_MINUTES.map((minutes) => (
                  <ToggleGroupItem key={minutes} value={String(minutes)}>
                    {minutes === 60
                      ? t("settings.household.tastes.anHour")
                      : t("settings.household.tastes.upTo", { minutes })}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </Field>
          </FieldGroup>
        )}
      </CardContent>
    </Card>
  )
}

/** A food to avoid, and whether it's an allergy. */
function AddAvoided({
  disabled,
  onAdd,
}: {
  disabled: boolean
  onAdd: (item: Avoided) => Promise<void>
}) {
  const { t } = useTranslation()
  const [food, setFood] = React.useState("")
  const [allergy, setAllergy] = React.useState(false)
  const id = React.useId()
  return (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={(event) => {
        event.preventDefault()
        if (!food.trim()) return
        void onAdd({ food: food.trim().toLowerCase(), allergy })
        setFood("")
        setAllergy(false)
      }}
    >
      <Input
        value={food}
        onChange={(event) => setFood(event.target.value)}
        placeholder={t("settings.household.tastes.foodPlaceholder")}
        aria-label={t("settings.household.tastes.food")}
        maxLength={60}
        className="min-w-40 flex-1"
      />
      <div className="flex items-center gap-2 px-1">
        <Checkbox
          id={`${id}-allergy`}
          checked={allergy}
          onCheckedChange={(checked) => setAllergy(checked === true)}
        />
        <Label htmlFor={`${id}-allergy`} className="font-normal">
          {t("settings.household.tastes.allergy")}
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
        {t("settings.household.tastes.add")}
      </Button>
    </form>
  )
}
