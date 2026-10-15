import * as React from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Calendar03Icon,
  Compass01Icon,
  CookBookIcon,
  Delete02Icon,
  Link01Icon,
  ShoppingBasketAdd01Icon,
  SparklesIcon,
  Tag01Icon,
} from "@hugeicons/core-free-icons"
import { Link, useLocation, useSearchParams } from "react-router"
import { toast } from "sonner"

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
import {
  FollowSitesPrompt,
  SitesSpotlight,
} from "@/features/discover/sites-spotlight"
import {
  SelectButton,
  SelectionBar,
  SelectionHeader,
  useSelectionKeepOnly,
} from "@/features/select/selection-bar"
import { useSelection } from "@/features/select/use-selection"
import { useDeals } from "@/features/shop/use-shop"
import { ApiError } from "@/lib/api"

import { AddRecipeMenu } from "./add-recipe-menu"
import { ImportDialog } from "./import-dialog"
import { ImportChip } from "./import-chip"
import {
  DeleteRecipesDialog,
  exportRecipes,
  PlanRecipesDialog,
  TagRecipesDialog,
} from "./bulk-dialogs"
import {
  RecipeCard,
  RecipeRow,
  useRecipeView,
  type CardSelect,
} from "./recipe-card"
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
import {
  useDeletedRecipes,
  useRecipeBulk,
  useRecipeCosts,
  useRecipes,
} from "./use-recipes"

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
  const onSale = useDeals().data?.recipes ?? {}
  const costs = useRecipeCosts().data ?? {}
  const all = recipes.data ?? []
  const shown = sortRecipes(filterRecipes(all, filters, onSale), filters.sort)
  const [revealed, revealMore] = useRevealed()
  const deletedCount = useDeletedRecipes().data?.length ?? 0

  // Select mode: pick recipes, then act on them all.
  const selection = useSelection()
  useSelectionKeepOnly(
    selection,
    shown.map((recipe) => recipe.id)
  )
  const picked = shown.filter((recipe) => selection.isPicked(recipe.id))
  const pickedIds = picked.map((recipe) => recipe.id)
  const bulk = useRecipeBulk()
  const [dialog, setDialog] = React.useState<"plan" | "tags" | "delete" | null>(
    null
  )
  const selectOf = (id: string): CardSelect => ({
    selecting: selection.selecting,
    picked: selection.isPicked(id),
    onToggle: () => selection.toggle(id),
    onLongPress: () => selection.start(id),
  })

  /** One of the background jobs: nutrition, photos, tidying up. */
  function startJob(action: "nutrition" | "photos" | "tidy", what: string) {
    bulk.mutate(
      { action, ids: pickedIds },
      {
        onSuccess: ({ changed }) => {
          toast.success(
            `${what} for ${changed} ${changed === 1 ? "recipe" : "recipes"}. It carries on in the background.`
          )
          selection.done()
        },
        onError: (error) =>
          toast.error(
            error instanceof ApiError ? error.message : "That didn't work"
          ),
      }
    )
  }

  function change(next: Partial<RecipeFilters>) {
    setParams((current) => writeFilters(current, next), {
      replace: true,
      preventScrollReset: true,
    })
  }

  const libraryEmpty = !q && recipes.data?.length === 0
  const narrowed = Boolean(
    search.trim() ||
    filters.tags.length ||
    filters.diets.length ||
    filters.time ||
    filters.sale ||
    filters.fresh
  )
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
          selection.selecting ? (
            <SelectionHeader
              selection={selection}
              allIds={shown.map((recipe) => recipe.id)}
            />
          ) : (
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
              {!libraryEmpty && (
                <SelectButton selection={selection} disabled={!shown.length} />
              )}
              <AddRecipeMenu />
            </>
          )
        }
      />
      <ImportDialog />
      <ImportChip />

      {!libraryEmpty && (
        <RecipeFilterBar
          filters={filters}
          search={search}
          onSearch={setSearch}
          onChange={change}
          all={all}
          shown={shown}
          onSale={onSale}
        />
      )}

      {/* What's new on the sites you follow: on "All", folded away while searching or filtering. */}
      {!libraryEmpty && <SitesSpotlight hidden={narrowed} />}

      {recipes.isPending ? (
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 xl:grid-cols-4">
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
            filters.time ||
            filters.sale ||
            filters.fresh) && (
            <Button
              variant="outline"
              onClick={() =>
                change({
                  tags: [],
                  diets: [],
                  time: null,
                  sale: false,
                  fresh: false,
                })
              }
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
                <RecipeRow
                  key={recipe.id}
                  recipe={recipe}
                  onSale={onSale[recipe.id]}
                  cost={costs[recipe.id]}
                  select={selectOf(recipe.id)}
                />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 xl:grid-cols-4">
              {shown.slice(0, revealed).map((recipe) => (
                <RecipeCard
                  key={recipe.id}
                  recipe={recipe}
                  onSale={onSale[recipe.id]}
                  cost={costs[recipe.id]}
                  select={selectOf(recipe.id)}
                />
              ))}
            </div>
          )}
          {shown.length > revealed && <RevealMore onReveal={revealMore} />}
        </>
      )}

      {/* Once the library's all drawn: sites to follow, if none are. */}
      {recipes.isSuccess && !libraryEmpty && shown.length <= revealed && (
        <FollowSitesPrompt />
      )}

      {deletedCount > 0 && !selection.selecting && (
        <p className="mt-8 text-center text-sm text-muted-foreground">
          <Link
            to="/recipes/deleted"
            className="font-medium text-foreground underline underline-offset-4"
          >
            Recently deleted
          </Link>{" "}
          has {deletedCount} {deletedCount === 1 ? "recipe" : "recipes"}, kept
          for 30 days.
        </p>
      )}

      <SelectionBar
        selection={selection}
        actions={[
          {
            label: "Add to plan",
            icon: Calendar03Icon,
            onSelect: () => setDialog("plan"),
          },
          {
            label: "Add to list",
            icon: ShoppingBasketAdd01Icon,
            onSelect: () =>
              bulk.mutate(
                { action: "toList", ids: pickedIds },
                {
                  onSuccess: ({ changed }) => {
                    toast.success(
                      changed
                        ? `${changed} ${changed === 1 ? "thing" : "things"} on the list`
                        : "Everything's on the list or at home already"
                    )
                    selection.done()
                  },
                }
              ),
          },
          {
            label: "Tags",
            icon: Tag01Icon,
            onSelect: () => setDialog("tags"),
          },
          {
            label: "Delete",
            icon: Delete02Icon,
            destructive: true,
            onSelect: () => setDialog("delete"),
          },
        ]}
        more={[
          {
            label: "Tidy up with AI",
            onSelect: () => startJob("tidy", "Tidying up"),
          },
          {
            label: "Work out nutrition",
            onSelect: () => startJob("nutrition", "Working out nutrition"),
          },
          {
            label: "Make photos",
            onSelect: () => startJob("photos", "Making photos"),
          },
          {
            label: "Export",
            onSelect: () =>
              void exportRecipes(picked).catch(() =>
                toast.error("Couldn't export those")
              ),
          },
        ]}
      />
      <PlanRecipesDialog
        recipes={picked}
        open={dialog === "plan"}
        onOpenChange={(open) => setDialog(open ? "plan" : null)}
        onDone={() => {
          setDialog(null)
          selection.done()
        }}
      />
      <TagRecipesDialog
        ids={pickedIds}
        open={dialog === "tags"}
        onOpenChange={(open) => setDialog(open ? "tags" : null)}
      />
      <DeleteRecipesDialog
        recipes={picked}
        open={dialog === "delete"}
        onOpenChange={(open) => setDialog(open ? "delete" : null)}
        onDeleted={() => {
          setDialog(null)
          selection.done()
        }}
      />
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
