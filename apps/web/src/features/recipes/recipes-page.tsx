import * as React from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Compass01Icon,
  CookBookIcon,
  Link01Icon,
  SparklesIcon,
} from "@hugeicons/core-free-icons"
import { Link, useLocation, useSearchParams } from "react-router"

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
import { RecipeCard, RecipeRow, useRecipeView } from "./recipe-card"
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
 * URL. Cards are drawn a page at a time as you scroll, so a big library
 * opens quickly.
 */
export function RecipesPage() {
  const [params, setParams] = useSearchParams()
  const filters = readFilters(params)
  const [search, setSearch] = React.useState(filters.q)
  const q = useDebounced(search.trim(), 250)
  const [view] = useRecipeView()

  // Only when the typed search settles on something new: an unneeded
  // replace would lose the scroll position coming Back to the page.
  const urlQ = filters.q
  React.useEffect(() => {
    if (q === urlQ) return
    setParams((current) => writeFilters(current, { q }), {
      replace: true,
      preventScrollReset: true,
    })
  }, [q, urlQ, setParams])

  const me = useCurrentUser()
  const importDialog = useImportDialog()
  const pendingReview = usePendingProposals().data?.length ?? 0
  const recipes = useRecipes({ q })
  const all = recipes.data ?? []
  const shown = sortRecipes(filterRecipes(all, filters), filters.sort)
  const [revealed, revealMore] = useRevealed()

  function change(next: Partial<RecipeFilters>) {
    setParams((current) => writeFilters(current, next), {
      replace: true,
      preventScrollReset: true,
    })
  }

  const libraryEmpty = !q && recipes.data?.length === 0
  const libraryCount = !q && recipes.data?.length ? recipes.data.length : null

  return (
    <>
      <PageHeader
        title="Recipes"
        description={
          libraryCount
            ? `${libraryCount.toLocaleString()} ${libraryCount === 1 ? "recipe" : "recipes"}, everything you cook in one place.`
            : "Everything you cook, in one place."
        }
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
            {!libraryEmpty && (
              <Button variant="outline" asChild>
                <Link to="/discover">
                  <HugeiconsIcon
                    icon={Compass01Icon}
                    strokeWidth={2}
                    data-icon="inline-start"
                  />
                  Find recipes
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
              Start from a hand-picked collection, paste a link from any recipe
              site or video, or snap a photo of a cookbook page
              {me.isServerAdmin ? ", or bring over your Mealie library" : ""}.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <div className="flex flex-wrap justify-center gap-2">
              <Button asChild>
                <Link to="/discover">
                  <HugeiconsIcon
                    icon={Compass01Icon}
                    strokeWidth={2}
                    data-icon="inline-start"
                  />
                  Browse collections
                </Link>
              </Button>
              <Button
                variant="outline"
                onClick={() => importDialog.open("link")}
              >
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
        <>
          {view === "list" ? (
            <div className="-mx-2 grid gap-x-6 gap-y-0.5 lg:grid-cols-2">
              {shown.slice(0, revealed).map((recipe) => (
                <RecipeRow key={recipe.id} recipe={recipe} />
              ))}
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {shown.slice(0, revealed).map((recipe) => (
                <RecipeCard key={recipe.id} recipe={recipe} />
              ))}
            </div>
          )}
          {shown.length > revealed && <RevealMore onReveal={revealMore} />}
        </>
      )}
    </>
  )
}

const PAGE_SIZE = 48

/**
 * How far each visit to the page got (by history entry), while the app is
 * open. Not kept across reloads: the first page loaded always has the same
 * key, so a saved count could belong to another visit.
 */
const revealedByVisit = new Map<string, number>()

/**
 * How many recipes to draw: a page at first, then more as the end scrolls
 * near. Remembered for this visit to the page (filters make a new one), so
 * Back from a recipe lands where you were.
 */
function useRevealed() {
  const { key } = useLocation()
  const [, redraw] = React.useReducer((n: number) => n + 1, 0)
  const count = revealedByVisit.get(key) ?? PAGE_SIZE
  const more = React.useCallback(() => {
    revealedByVisit.set(key, count + PAGE_SIZE)
    redraw()
  }, [count, key])
  return [count, more] as const
}

/** Asks for more once it's within a couple of screens of view. */
function RevealMore({ onReveal }: { onReveal: () => void }) {
  const marker = React.useRef<HTMLDivElement>(null)
  React.useEffect(() => {
    const node = marker.current
    if (!node) return
    // A new observer after each reveal checks again, so a tall screen
    // keeps filling until the marker is out of reach.
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) onReveal()
      },
      { rootMargin: "1500px 0px" }
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [onReveal])
  return (
    <div ref={marker} className="flex justify-center py-8">
      <Skeleton className="h-4 w-32" />
    </div>
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
