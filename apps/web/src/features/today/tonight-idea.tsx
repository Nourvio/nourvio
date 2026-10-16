import { RefreshIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useQuery } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import * as React from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { Fact } from "@/features/plan/next-meal-card"
import { suggest, type PlanEntry } from "@/features/plan/queries"
import { usePlanActions } from "@/features/plan/use-plan-actions"
import { useWhyText } from "@/features/plan/why"
import { formatMinutes } from "@/features/recipes/format"

import { AlsoToday } from "./also-today"

/**
 * Dinner's open tonight: one idea at a time from the household's recipes,
 * the way Fill the week picks (using up what needs using, keeping to
 * tastes and the night's theme), saying why. Plan it for tonight, or
 * another idea.
 */
export function TonightIdea({
  today,
  others,
}: {
  today: string
  others: PlanEntry[]
}) {
  const { t } = useTranslation()
  const actions = usePlanActions()
  const whyText = useWhyText()
  const id = React.useId()
  // Ideas already shown, so Another idea is another.
  const [seen, setSeen] = React.useState<string[]>([])
  const [planning, setPlanning] = React.useState(false)
  const ideas = useQuery({
    queryKey: ["ideas", "tonight", today, seen],
    queryFn: async () =>
      (await suggest([{ date: today, meal: "dinner" }], seen)).suggestions[0] ??
      null,
    staleTime: Infinity,
    placeholderData: (previous) => previous,
  })
  const idea = ideas.data

  if (ideas.isPending) return <Skeleton className="h-72 rounded-3xl" />

  if (!idea) {
    return (
      <article className="grid gap-3 rounded-3xl border border-dashed bg-card p-6 text-card-foreground md:p-8">
        <h2 className="font-heading text-2xl font-semibold">
          {t("today.idea.none")}
        </h2>
        <p className="text-muted-foreground">
          {seen.length > 0 ? t("today.idea.allSeen") : t("today.idea.noneHint")}
        </p>
        <div className="flex flex-wrap gap-2">
          {seen.length > 0 && (
            <Button variant="outline" onClick={() => setSeen([])}>
              {t("today.idea.startOver")}
            </Button>
          )}
          <Button variant="outline" render={<Link to="/plan" />}>
            {t("today.openPlan")}
          </Button>
        </div>
        <AlsoToday entries={others} />
      </article>
    )
  }

  async function plan() {
    if (!idea) return
    setPlanning(true)
    const added = await actions.add({
      date: today,
      meal: "dinner",
      recipe: idea.recipe.id,
      withRecipe: idea.withRecipe?.id ?? null,
      why: idea.why,
    })
    setPlanning(false)
    if (added)
      toast.success(t("today.idea.planned", { name: idea.recipe.name }))
  }

  const busy = planning || ideas.isFetching

  return (
    <article
      aria-labelledby={id}
      className="overflow-hidden rounded-3xl border bg-card text-card-foreground sm:flex"
    >
      {idea.recipe.photo && (
        <div className="relative shrink-0 overflow-hidden bg-muted sm:min-h-56 sm:w-72">
          <img
            src={idea.recipe.photo}
            alt=""
            className="aspect-[16/10] w-full object-cover sm:absolute sm:inset-0 sm:aspect-auto sm:h-full"
          />
        </div>
      )}
      <div className="grid min-w-0 flex-1 content-center gap-4 p-5 md:p-7">
        <div className="grid gap-2">
          <p className="justify-self-start rounded-full bg-primary px-3 py-1 text-xs font-bold tracking-wider text-primary-foreground uppercase">
            {t("today.idea.badge")}
          </p>
          <h2
            id={id}
            className="font-heading text-2xl leading-tight font-semibold md:text-3xl"
          >
            <Link
              to="/recipes/$slug"
              params={{ slug: idea.recipe.slug }}
              search={idea.withRecipe ? { with: idea.withRecipe.slug } : {}}
              className="hover:underline"
            >
              {idea.recipe.name}
            </Link>
            {idea.withRecipe && (
              <span className="font-normal text-muted-foreground">
                {" "}
                {t("plan.withName", { name: idea.withRecipe.name })}
              </span>
            )}
          </h2>
          <p className="text-sm font-medium text-primary">
            {idea.why.length > 0
              ? whyText(idea.why)
              : t("today.idea.fromRecipes")}
          </p>
          {(idea.recipe.servings != null ||
            idea.recipe.totalMinutes != null) && (
            <div className="flex flex-wrap gap-1.5">
              {idea.recipe.servings != null && (
                <Fact>
                  {t("plan.servings", { count: idea.recipe.servings })}
                </Fact>
              )}
              {idea.recipe.totalMinutes != null && (
                <Fact>{formatMinutes(t, idea.recipe.totalMinutes)}</Fact>
              )}
            </div>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="lg" disabled={busy} onClick={() => void plan()}>
            {planning && <Spinner data-icon="inline-start" />}
            {t("today.idea.plan")}
          </Button>
          <Button
            size="lg"
            variant="outline"
            disabled={busy}
            onClick={() => setSeen([...seen, idea.recipe.id])}
          >
            <HugeiconsIcon
              icon={RefreshIcon}
              strokeWidth={2}
              data-icon="inline-start"
            />
            {t("today.idea.another")}
          </Button>
        </div>
        <AlsoToday entries={others} />
      </div>
    </article>
  )
}
