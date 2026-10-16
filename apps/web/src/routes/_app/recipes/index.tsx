import {
  CookBookIcon,
  Delete02Icon,
  MoreHorizontalIcon,
  Tag01Icon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useInfiniteQuery } from "@tanstack/react-query"
import { createFileRoute, Link } from "@tanstack/react-router"
import * as React from "react"
import { useTranslation } from "react-i18next"

import { PageHeader } from "@/components/layout/page-header"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { AddRecipeDialog } from "@/features/recipes/add-recipe-dialog"
import { ManageTagsDialog } from "@/features/recipes/manage-tags-dialog"
import {
  RECIPE_SORTS,
  recipesQuery,
  type RecipeSearch,
  type RecipeSort,
} from "@/features/recipes/queries"
import { RecipeCard } from "@/features/recipes/recipe-card"
import { RecipeFilters } from "@/features/recipes/recipe-filters"

export const Route = createFileRoute("/_app/recipes/")({
  validateSearch: (search: Record<string, unknown>): RecipeSearch => {
    const q = asText(search.q)
    const tags = asText(search.tags)
    return {
      ...(q ? { q } : {}),
      ...(tags ? { tags } : {}),
      ...((RECIPE_SORTS as readonly unknown[]).includes(search.sort)
        ? { sort: search.sort as RecipeSort }
        : {}),
    }
  },
  component: RecipesPage,
})

/** The address reads "7" as a number: a search for 7 is still text. */
function asText(value: unknown) {
  return typeof value === "string" || typeof value === "number"
    ? String(value)
    : undefined
}

function RecipesPage() {
  const { t } = useTranslation()
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const [managingTags, setManagingTags] = React.useState(false)
  const recipes = useInfiniteQuery(recipesQuery(search))

  const setSearch = React.useCallback(
    (next: RecipeSearch) => void navigate({ search: next, replace: true }),
    [navigate]
  )
  const filtered = Boolean(search.q || search.tags)
  const total = recipes.data?.pages[0]?.total ?? 0
  const items = recipes.data?.pages.flatMap((page) => page.recipes) ?? []

  return (
    <>
      <PageHeader
        title={t("nav.recipes")}
        actions={
          <>
            <AddRecipeDialog />
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
                <DropdownMenuItem onClick={() => setManagingTags(true)}>
                  <HugeiconsIcon icon={Tag01Icon} strokeWidth={2} />
                  {t("recipes.manageTags")}
                </DropdownMenuItem>
                <DropdownMenuItem render={<Link to="/recipes/deleted" />}>
                  <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} />
                  {t("recipes.deleted.title")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        }
      />
      <ManageTagsDialog open={managingTags} onOpenChange={setManagingTags} />

      <div className="space-y-6">
        <RecipeFilters search={search} onChange={setSearch} />

        {recipes.isPending ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 8 }, (_, index) => (
              <Skeleton key={index} className="h-72 rounded-3xl" />
            ))}
          </div>
        ) : recipes.isError ? (
          <Empty className="rounded-3xl border border-dashed">
            <EmptyHeader>
              <EmptyTitle>{t("status.error.title")}</EmptyTitle>
              <EmptyDescription>
                {t("status.error.description")}
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button variant="outline" onClick={() => recipes.refetch()}>
                {t("status.tryAgain")}
              </Button>
            </EmptyContent>
          </Empty>
        ) : items.length === 0 ? (
          filtered ? (
            <Empty className="rounded-3xl border border-dashed">
              <EmptyHeader>
                <EmptyTitle>{t("recipes.noMatches")}</EmptyTitle>
                <EmptyDescription>
                  {t("recipes.noMatchesHint")}
                </EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <Button
                  variant="outline"
                  onClick={() => setSearch({ sort: search.sort })}
                >
                  {t("recipes.clearFilters")}
                </Button>
              </EmptyContent>
            </Empty>
          ) : (
            <Empty className="rounded-3xl border border-dashed">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <HugeiconsIcon icon={CookBookIcon} strokeWidth={2} />
                </EmptyMedia>
                <EmptyTitle>{t("recipes.none")}</EmptyTitle>
                <EmptyDescription>{t("recipes.noneHint")}</EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <AddRecipeDialog />
              </EmptyContent>
            </Empty>
          )
        ) : (
          <>
            <p className="text-sm text-muted-foreground" aria-live="polite">
              {t("recipes.count", { count: total })}
            </p>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {items.map((recipe) => (
                <RecipeCard key={recipe.id} recipe={recipe} />
              ))}
            </div>
            {recipes.hasNextPage && (
              <div className="flex justify-center">
                <Button
                  variant="outline"
                  onClick={() => recipes.fetchNextPage()}
                  disabled={recipes.isFetchingNextPage}
                >
                  {recipes.isFetchingNextPage && <Spinner />}
                  {t("recipes.showMore")}
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </>
  )
}
