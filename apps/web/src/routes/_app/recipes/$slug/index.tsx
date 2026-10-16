import {
  ArrowLeft01Icon,
  Clock01Icon,
  Delete02Icon,
  Edit02Icon,
  LinkSquare02Icon,
  MoreHorizontalIcon,
  Time04Icon,
  UserGroupIcon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useSuspenseQuery } from "@tanstack/react-query"
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router"
import * as React from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  formatMinutes,
  formatServings,
  sourceName,
} from "@/features/recipes/format"
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
import { RatingStars } from "@/features/recipes/rating-stars"
import { StepList } from "@/features/recipes/step-list"
import { useUnitSystem } from "@/features/recipes/use-unit-system"
import { VersionsDialog } from "@/features/recipes/versions-dialog"
import { api, unwrap } from "@/lib/api/client"

export const Route = createFileRoute("/_app/recipes/$slug/")({
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(recipeQuery(params.slug)),
  component: RecipePage,
})

function RecipePage() {
  const { slug } = Route.useParams()
  const { data: recipe } = useSuspenseQuery(recipeQuery(slug))
  // A fresh page, with its own servings, for each recipe.
  return <RecipeView key={recipe.id} recipe={recipe} />
}

function RecipeView({ recipe }: { recipe: Recipe }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const refresh = useRefreshRecipes()
  const servings = useServings(recipe)
  const [system, setSystem] = useUnitSystem()
  const [showVersions, setShowVersions] = React.useState(false)

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

  const times = [
    recipe.prepMinutes !== null && [
      t("recipes.fields.prep"),
      formatMinutes(t, recipe.prepMinutes),
    ],
    recipe.cookMinutes !== null && [
      t("recipes.fields.cook"),
      formatMinutes(t, recipe.cookMinutes),
    ],
  ].filter((entry): entry is string[] => Boolean(entry))

  return (
    <article className="space-y-6 pt-2 md:pt-4">
      <div className="space-y-4">
        <Button
          variant="ghost"
          size="sm"
          className="-ml-3"
          render={<Link to="/recipes" />}
        >
          <HugeiconsIcon icon={ArrowLeft01Icon} strokeWidth={2} />
          {t("nav.recipes")}
        </Button>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-2">
            <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">
              {recipe.name}
            </h1>
            {recipe.description && (
              <p className="max-w-prose text-lg text-muted-foreground">
                {recipe.description}
              </p>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button
              render={
                <Link to="/recipes/$slug/edit" params={{ slug: recipe.slug }} />
              }
            >
              <HugeiconsIcon icon={Edit02Icon} strokeWidth={2} />
              {t("recipes.edit")}
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    variant="outline"
                    size="icon"
                    aria-label={t("recipes.more")}
                  />
                }
              >
                <HugeiconsIcon icon={MoreHorizontalIcon} strokeWidth={2} />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setShowVersions(true)}>
                  <HugeiconsIcon icon={Time04Icon} strokeWidth={2} />
                  {t("recipes.versions.title")}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onClick={remove}>
                  <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} />
                  {t("recipes.delete")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted-foreground">
          {recipe.totalMinutes !== null && (
            <span className="inline-flex items-center gap-1.5">
              <HugeiconsIcon
                icon={Clock01Icon}
                strokeWidth={2}
                className="size-4"
              />
              {formatMinutes(t, recipe.totalMinutes)}
              {times.length > 0 && (
                <span>
                  (
                  {times
                    .map(([label, value]) => `${label} ${value}`)
                    .join(", ")}
                  )
                </span>
              )}
            </span>
          )}
          {(recipe.servings !== null || recipe.yieldText) && (
            <span className="inline-flex items-center gap-1.5">
              <HugeiconsIcon
                icon={UserGroupIcon}
                strokeWidth={2}
                className="size-4"
              />
              {[
                recipe.servings !== null &&
                  t("recipes.serves", {
                    count: recipe.servings,
                    servings: formatServings(recipe.servings),
                  }),
                recipe.yieldText,
              ]
                .filter(Boolean)
                .join(" · ")}
            </span>
          )}
          {recipe.rating !== null && <RatingStars rating={recipe.rating} />}
          {recipe.sourceUrl && (
            <a
              href={recipe.sourceUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex items-center gap-1.5 font-medium text-primary hover:underline"
            >
              <HugeiconsIcon
                icon={LinkSquare02Icon}
                strokeWidth={2}
                className="size-4"
              />
              {sourceName(recipe.sourceUrl)}
            </a>
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
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("recipes.fields.ingredients")}</CardTitle>
          {recipe.ingredients.length > 0 && (
            <CardAction className="flex flex-wrap justify-end gap-2">
              <ServingsStepper servings={servings} />
            </CardAction>
          )}
        </CardHeader>
        <CardContent className="space-y-5">
          {recipe.ingredients.length === 0 ? (
            <p className="text-muted-foreground">
              {t("recipes.noIngredients")}
            </p>
          ) : (
            <>
              {convertible(recipe.ingredients) && (
                <UnitToggle system={system} onChange={setSystem} />
              )}
              <IngredientList
                lines={recipe.ingredients}
                factor={servings.factor}
                system={system}
              />
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("recipes.fields.steps")}</CardTitle>
        </CardHeader>
        <CardContent>
          {recipe.steps.length === 0 ? (
            <p className="text-muted-foreground">{t("recipes.noSteps")}</p>
          ) : (
            <StepList steps={recipe.steps} system={system} />
          )}
        </CardContent>
      </Card>

      {recipe.notes && (
        <Card>
          <CardHeader>
            <CardTitle>{t("recipes.fields.notes")}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="leading-relaxed whitespace-pre-line">
              {recipe.notes}
            </p>
          </CardContent>
        </Card>
      )}

      <VersionsDialog
        recipe={recipe}
        open={showVersions}
        onOpenChange={setShowVersions}
      />
    </article>
  )
}
