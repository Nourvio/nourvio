import {
  ArrowLeft01Icon,
  Delete02Icon,
  Edit02Icon,
  ImageAdd02Icon,
  ImageRemove01Icon,
  LinkSquare02Icon,
  MoreHorizontalIcon,
  Time04Icon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query"
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router"
import * as React from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { formatMinutes, sourceName } from "@/features/recipes/format"
import {
  convertible,
  IngredientList,
  ServingsStepper,
  UnitToggle,
  useServings,
} from "@/features/recipes/ingredient-list"
import {
  recipeQuery,
  useRefreshRecipes,
  type Recipe,
} from "@/features/recipes/queries"
import { RatingInput } from "@/features/recipes/rating-stars"
import { RecipePhoto, usePhotoActions } from "@/features/recipes/recipe-photo"
import { StepList } from "@/features/recipes/step-list"
import { useUnitSystem } from "@/features/recipes/use-unit-system"
import { VersionsDialog } from "@/features/recipes/versions-dialog"
import { api, ApiError, unwrap } from "@/lib/api/client"
import { formatRelativeDate } from "@/lib/format"

export const Route = createFileRoute("/_app/recipes/$slug/")({
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(recipeQuery(params.slug)),
  component: RecipePage,
})

function RecipePage() {
  const { slug } = Route.useParams()
  const { data: recipe } = useSuspenseQuery(recipeQuery(slug))
  // A fresh page, with its own servings and ticks, for each recipe.
  return <RecipeView key={recipe.id} recipe={recipe} />
}

function RecipeView({ recipe }: { recipe: Recipe }) {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const refresh = useRefreshRecipes()
  const servings = useServings(recipe)
  const [system, setSystem] = useUnitSystem()
  const [showVersions, setShowVersions] = React.useState(false)
  const photo = usePhotoActions(recipe)

  async function rate(rating: number | null) {
    const key = recipeQuery(recipe.slug).queryKey
    // The stars change at once; they go back if saving fails.
    queryClient.setQueryData(key, { ...recipe, rating })
    try {
      queryClient.setQueryData(
        key,
        await unwrap(
          api.PUT("/api/recipes/{recipe}/rating", {
            params: { path: { recipe: recipe.id } },
            body: { rating },
          })
        )
      )
      await refresh()
    } catch (error) {
      queryClient.setQueryData(key, recipe)
      if (!(error instanceof ApiError)) throw error
      toast.error(error.message)
    }
  }

  async function remove() {
    await unwrap(
      api.DELETE("/api/recipes/{recipe}", {
        params: { path: { recipe: recipe.id } },
      })
    )
    await refresh()
    await navigate({ to: "/recipes" })
    toast.success(t("recipes.deletedToast", { name: recipe.name }), {
      action: {
        label: t("recipes.undo"),
        onClick: async () => {
          await unwrap(
            api.POST("/api/recipes/deleted/{recipeId}/restore", {
              params: { path: { recipeId: recipe.id } },
            })
          )
          await refresh()
          await navigate({
            to: "/recipes/$slug",
            params: { slug: recipe.slug },
          })
        },
      },
    })
  }

  const facts = [
    recipe.prepMinutes !== null && [
      t("recipes.facts.prep"),
      formatMinutes(t, recipe.prepMinutes),
    ],
    recipe.cookMinutes !== null && [
      t("recipes.facts.cook"),
      formatMinutes(t, recipe.cookMinutes),
    ],
    recipe.totalMinutes !== null && [
      t("recipes.facts.total"),
      formatMinutes(t, recipe.totalMinutes),
    ],
    recipe.yieldText && [t("recipes.facts.makes"), recipe.yieldText],
  ].filter((fact): fact is [string, string] => Boolean(fact))

  return (
    <article className="grid gap-8 pt-2 pb-6">
      <Link
        to="/recipes"
        className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <HugeiconsIcon
          icon={ArrowLeft01Icon}
          strokeWidth={2}
          className="size-4"
        />
        {t("nav.recipes")}
      </Link>

      {/* The photo on the left, and what the recipe is on the right. */}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:gap-10">
        <RecipePhoto recipe={recipe} actions={photo} />
        <div className="grid content-start gap-4">
          <h1 className="text-3xl leading-tight font-semibold tracking-tight md:text-4xl">
            {recipe.name}
          </h1>
          {recipe.description && (
            <p className="text-lg text-muted-foreground">
              {recipe.description}
            </p>
          )}
          {facts.length > 0 && (
            <dl className="flex flex-wrap gap-x-6 gap-y-2">
              {facts.map(([label, value]) => (
                <div key={label}>
                  <dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                    {label}
                  </dt>
                  <dd className="font-medium">{value}</dd>
                </div>
              ))}
            </dl>
          )}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <RatingInput value={recipe.rating} onChange={rate} />
            {recipe.lastMadeAt && (
              <span className="text-sm text-muted-foreground">
                {t("recipes.lastMade", {
                  when: formatRelativeDate(recipe.lastMadeAt, i18n.language),
                })}
              </span>
            )}
          </div>
          {recipe.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {recipe.tags.map((tag) => (
                <Badge
                  key={tag}
                  variant="secondary"
                  render={<Link to="/recipes" search={{ tags: tag }} />}
                >
                  {tag}
                </Badge>
              ))}
            </div>
          )}
          <div className="flex flex-wrap gap-2 pt-2">
            <Button
              size="lg"
              variant="outline"
              render={
                <Link to="/recipes/$slug/edit" params={{ slug: recipe.slug }} />
              }
            >
              <HugeiconsIcon
                icon={Edit02Icon}
                strokeWidth={2}
                data-icon="inline-start"
              />
              {t("recipes.edit")}
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    variant="outline"
                    size="icon-lg"
                    aria-label={t("recipes.more")}
                  />
                }
              >
                <HugeiconsIcon icon={MoreHorizontalIcon} strokeWidth={2} />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuItem onClick={() => setShowVersions(true)}>
                  <HugeiconsIcon icon={Time04Icon} strokeWidth={2} />
                  {t("recipes.versions.title")}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={photo.choose}>
                  <HugeiconsIcon icon={ImageAdd02Icon} strokeWidth={2} />
                  {recipe.photo
                    ? t("recipes.photo.change")
                    : t("recipes.photo.add")}
                </DropdownMenuItem>
                {recipe.photo && (
                  <DropdownMenuItem onClick={() => void photo.remove()}>
                    <HugeiconsIcon icon={ImageRemove01Icon} strokeWidth={2} />
                    {t("recipes.photo.remove")}
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onClick={remove}>
                  <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} />
                  {t("recipes.delete")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>

      {/* Ingredients in a tall column on the left, the steps beside them. */}
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)] lg:gap-10">
        <Card className="h-fit lg:sticky lg:top-20">
          <CardHeader className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle className="text-xl font-semibold">
              {t("recipes.fields.ingredients")}
            </CardTitle>
            {recipe.ingredients.length > 0 && (
              <ServingsStepper servings={servings} />
            )}
            {convertible(recipe.ingredients) && (
              <UnitToggle
                system={system}
                onChange={setSystem}
                className="w-full"
              />
            )}
          </CardHeader>
          <CardContent>
            {recipe.ingredients.length === 0 ? (
              <p className="text-muted-foreground">
                {t("recipes.noIngredients")}
              </p>
            ) : (
              <IngredientList
                lines={recipe.ingredients}
                factor={servings.factor}
                system={system}
              />
            )}
          </CardContent>
        </Card>

        <div className="grid content-start gap-8">
          <section className="grid gap-4">
            <h2 className="text-2xl font-semibold">
              {t("recipes.fields.steps")}
            </h2>
            {recipe.steps.length === 0 ? (
              <p className="text-muted-foreground">{t("recipes.noSteps")}</p>
            ) : (
              <StepList steps={recipe.steps} system={system} />
            )}
          </section>
          {recipe.notes && (
            <section className="grid gap-2">
              <h2 className="text-xl font-semibold">
                {t("recipes.fields.notes")}
              </h2>
              <p className="whitespace-pre-line text-muted-foreground">
                {recipe.notes}
              </p>
            </section>
          )}
          {recipe.sourceUrl && (
            <a
              href={recipe.sourceUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            >
              <HugeiconsIcon
                icon={LinkSquare02Icon}
                strokeWidth={2}
                className="size-4"
              />
              {t("recipes.original", { site: sourceName(recipe.sourceUrl) })}
            </a>
          )}
        </div>
      </div>

      {photo.input}
      <VersionsDialog
        recipe={recipe}
        open={showVersions}
        onOpenChange={setShowVersions}
      />
    </article>
  )
}
