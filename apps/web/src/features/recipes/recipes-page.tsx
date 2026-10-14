import * as React from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  CookBookIcon,
  Link01Icon,
  SparklesIcon,
} from "@hugeicons/core-free-icons"
import { Link, useSearchParams } from "react-router"

import { PageHeader } from "@/components/layout/page-header"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { Skeleton } from "@/components/ui/skeleton"
import { useCurrentUser } from "@/features/auth/current-user"

import { AddRecipeMenu } from "./add-recipe-menu"
import { ImportDialog } from "./import-dialog"
import { RecipeCard } from "./recipe-card"
import { usePendingProposals } from "./use-cleanup"
import { useImportDialog } from "./use-import"
import { RecipeFilterBar } from "./recipe-filter-bar"
import {
  filterRecipes,
  readFilters,
  sortRecipes,
  writeFilters,
  type RecipeFilters,
} from "./recipe-filters"
import { useRecipes } from "./use-recipes"

/**
 * The library: search (on the server, through ingredients too), then diet,
 * tag and time filters and sorting here, instantly. Everything is in the
 * URL.
 */
export function RecipesPage() {
  const [params, setParams] = useSearchParams()
  const filters = readFilters(params)
  const [search, setSearch] = React.useState(filters.q)
  const q = useDebounced(search.trim(), 250)

  React.useEffect(() => {
    setParams((current) => writeFilters(current, { q }), { replace: true })
  }, [q, setParams])

  const me = useCurrentUser()
  const importDialog = useImportDialog()
  const pendingReview = usePendingProposals().data?.length ?? 0
  const recipes = useRecipes({ q })
  const all = recipes.data ?? []
  const shown = sortRecipes(filterRecipes(all, filters), filters.sort)

  function change(next: Partial<RecipeFilters>) {
    setParams((current) => writeFilters(current, next), { replace: true })
  }

  const libraryEmpty = !q && recipes.data?.length === 0

  return (
    <>
      <PageHeader
        title="Recipes"
        description="Everything you cook, in one place."
        actions={
          <>
            {pendingReview > 0 && (
              <Button variant="outline" asChild>
                <Link to="/review">
                  <HugeiconsIcon
                    icon={SparklesIcon}
                    strokeWidth={2}
                    data-icon="inline-start"
                  />
                  {pendingReview} to review
                </Link>
              </Button>
            )}
            <AddRecipeMenu />
          </>
        }
      />
      <ImportDialog />

      {!libraryEmpty && (
        <RecipeFilterBar
          filters={filters}
          search={search}
          onSearch={setSearch}
          onChange={change}
          shown={shown}
          total={all.length}
        />
      )}

      {recipes.isPending ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 6 }, (_, i) => (
            <Card key={i} className="gap-0 overflow-hidden py-0">
              <Skeleton className="aspect-[4/3] rounded-none" />
              <div className="grid gap-2 p-4">
                <Skeleton className="h-5 w-3/4" />
                <Skeleton className="h-4 w-1/3" />
              </div>
            </Card>
          ))}
        </div>
      ) : recipes.isError ? (
        <p className="text-muted-foreground">Couldn't load recipes.</p>
      ) : libraryEmpty ? (
        <Empty className="border border-dashed">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <HugeiconsIcon icon={CookBookIcon} strokeWidth={2} />
            </EmptyMedia>
            <EmptyTitle>No recipes yet</EmptyTitle>
            <EmptyDescription>
              Paste a link from any recipe site or video, or snap a photo of a
              cookbook page
              {me.isServerAdmin ? ", or bring over your Mealie library" : ""}.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <div className="flex flex-wrap justify-center gap-2">
              <Button onClick={() => importDialog.open("link")}>
                <HugeiconsIcon
                  icon={Link01Icon}
                  strokeWidth={2}
                  data-icon="inline-start"
                />
                Import from a link
              </Button>
              {me.isServerAdmin && (
                <Button variant="outline" asChild>
                  <Link to="/settings#mealie">Move from Mealie</Link>
                </Button>
              )}
            </div>
          </EmptyContent>
        </Empty>
      ) : shown.length === 0 ? (
        <div className="grid justify-items-center gap-3 py-10 text-center">
          <p className="text-muted-foreground">
            Nothing matches that. Try another word or fewer filters.
          </p>
          {(filters.tags.length > 0 ||
            filters.diets.length > 0 ||
            filters.time) && (
            <Button
              variant="outline"
              onClick={() => change({ tags: [], diets: [], time: null })}
            >
              Clear filters
            </Button>
          )}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {shown.map((recipe) => (
            <RecipeCard key={recipe.id} recipe={recipe} />
          ))}
        </div>
      )}
    </>
  )
}

function useDebounced<T>(value: T, delay: number) {
  const [debounced, setDebounced] = React.useState(value)
  React.useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])
  return debounced
}
