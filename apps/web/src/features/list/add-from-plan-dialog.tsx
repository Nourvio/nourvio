import { addDays } from "@merran/shared"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import * as React from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Spinner } from "@/components/ui/spinner"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { formatMonthDay, formatShortWeekday } from "@/features/plan/format"
import { useHouseholdClock } from "@/features/plan/queries"
import { api, ApiError, unwrap } from "@/lib/api/client"

import { fromPlanQuery, listQuery } from "./queries"

/**
 * Puts a week's planned meals on the list, those not there yet, from today
 * on, and the every-week items.
 */
export function AddFromPlanDialog({
  open,
  onOpenChange,
  week,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The week to start on; this week when not given. */
  week?: string
}) {
  const { t } = useTranslation()
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("list.plan.title")}</DialogTitle>
          <DialogDescription>{t("list.plan.description")}</DialogDescription>
        </DialogHeader>
        {open && <AddFromPlan week={week} onDone={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  )
}

function AddFromPlan({
  week: asked,
  onDone,
}: {
  week?: string
  onDone: () => void
}) {
  const { t, i18n } = useTranslation()
  const queryClient = useQueryClient()
  const clock = useHouseholdClock()
  const nextWeek = addDays(clock.thisWeek, 7)
  const [week, setWeek] = React.useState(asked ?? clock.thisWeek)
  // Days gone by aren't shopped for.
  const from = week < clock.today ? clock.today : week
  const to = addDays(week, 6)
  const preview = useQuery({ ...fromPlanQuery(from, to), enabled: from <= to })
  const meals = preview.data?.meals ?? []
  const [busy, setBusy] = React.useState(false)

  async function add() {
    setBusy(true)
    try {
      const done = await unwrap(
        api.POST("/api/list/from-plan", { body: { from, to } })
      )
      await queryClient.invalidateQueries({ queryKey: listQuery.queryKey })
      const ingredients = done.added + done.merged
      const parts = [
        ingredients > 0 &&
          t("list.plan.ingredients", {
            count: ingredients,
            meals: t("list.plan.meals", { count: done.meals }),
          }),
        done.everyWeek > 0 &&
          t("list.plan.everyWeekItems", { count: done.everyWeek }),
      ].filter((part): part is string => Boolean(part))
      const what =
        parts.length === 2
          ? t("list.plan.and", { first: parts[0], second: parts[1] })
          : parts[0]
      toast.success(
        what ? t("list.plan.added", { what }) : t("list.plan.nothingNew"),
        {
          description:
            done.onHand.length > 0
              ? t("list.plan.leftOff", { names: done.onHand.join(", ") })
              : undefined,
        }
      )
      onDone()
    } catch (err) {
      if (!(err instanceof ApiError)) throw err
      toast.error(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid gap-5">
      <ToggleGroup
        variant="outline"
        value={[week]}
        onValueChange={(value) => {
          if (value[0]) setWeek(value[0])
        }}
        className="w-full"
      >
        <ToggleGroupItem value={clock.thisWeek} className="flex-1">
          {t("list.plan.thisWeek")}
        </ToggleGroupItem>
        <ToggleGroupItem value={nextWeek} className="flex-1">
          {t("list.plan.nextWeek")}
        </ToggleGroupItem>
      </ToggleGroup>

      <div className="rounded-xl bg-muted/60 p-4 text-sm">
        {preview.isPending ? (
          <p className="text-muted-foreground">{t("list.plan.checking")}</p>
        ) : meals.length > 0 ? (
          <ul className="grid gap-1">
            {meals.map((meal) => (
              <li key={meal.id} className="flex gap-2">
                <span className="w-24 shrink-0 text-muted-foreground">
                  {meal.anyDay
                    ? t("plan.pool")
                    : `${formatShortWeekday(meal.date, i18n.language)} ${formatMonthDay(meal.date, i18n.language)}`}
                </span>
                <span className="min-w-0 truncate font-medium">
                  {meal.name}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground">
            {preview.data?.listed
              ? t("list.plan.allListed")
              : t("list.plan.nothingPlanned")}
          </p>
        )}
      </div>

      <Button disabled={busy || preview.isPending} onClick={() => void add()}>
        {busy && <Spinner data-icon="inline-start" />}
        {meals.length > 0
          ? t("list.plan.add", { count: meals.length })
          : t("list.plan.addEveryWeek")}
      </Button>
    </div>
  )
}
