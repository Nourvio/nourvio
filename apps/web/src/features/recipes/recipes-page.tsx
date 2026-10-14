import * as React from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Cancel01Icon,
  CookBookIcon,
  Link01Icon,
  Search01Icon,
} from "@hugeicons/core-free-icons"
import { useSearchParams } from "react-router"

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
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group"
import { Skeleton } from "@/components/ui/skeleton"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { comingSoon } from "@/lib/coming-soon"

import { AddRecipeMenu } from "./add-recipe-menu"
import { ImportDialog } from "./import-dialog"
import { RecipeCard } from "./recipe-card"
import { useImportDialog } from "./use-import"
import { useRecipes, useTags } from "./use-recipes"

export function RecipesPage() {
  const [params, setParams] = useSearchParams()
  const tag = params.get("tag") ?? ""
  const [search, setSearch] = React.useState(params.get("q") ?? "")
  const q = useDebounced(search.trim(), 250)

  React.useEffect(() => {
    setParams(
      (current) => {
        const next = new URLSearchParams(current)
        if (q) next.set("q", q)
        else next.delete("q")
        return next
      },
      { replace: true }
    )
  }, [q, setParams])

  const importDialog = useImportDialog()
  const recipes = useRecipes({ q, tag })
  const tags = useTags()
  const filtering = Boolean(q || tag)

  function setTag(value: string) {
    setParams(
      (current) => {
        const next = new URLSearchParams(current)
        if (value) next.set("tag", value)
        else next.delete("tag")
        return next
      },
      { replace: true }
    )
  }

  const libraryEmpty = !filtering && recipes.data?.length === 0

  return (
    <>
      <PageHeader
        title="Recipes"
        description="Everything you cook, in one place."
        actions={<AddRecipeMenu />}
      />
      <ImportDialog />

      {!libraryEmpty && (
        <div className="mb-6 grid gap-3">
          <InputGroup className="max-w-md">
            <InputGroupAddon>
              <HugeiconsIcon icon={Search01Icon} strokeWidth={2} />
            </InputGroupAddon>
            <InputGroupInput
              type="search"
              placeholder="Search recipes, ingredients or tags"
              aria-label="Search recipes"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            {search && (
              <InputGroupAddon align="inline-end">
                <InputGroupButton
                  size="icon-xs"
                  aria-label="Clear search"
                  onClick={() => setSearch("")}
                >
                  <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} />
                </InputGroupButton>
              </InputGroupAddon>
            )}
          </InputGroup>
          {tags.data && tags.data.length > 0 && (
            <ToggleGroup
              type="single"
              variant="outline"
              size="sm"
              value={tag}
              onValueChange={setTag}
              aria-label="Filter by tag"
              className="flex-wrap justify-start"
            >
              {tags.data.slice(0, 14).map((t) => (
                <ToggleGroupItem key={t.name} value={t.name}>
                  {t.name}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          )}
        </div>
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
              Paste a link from any recipe site or video, snap a photo of a
              cookbook page, or bring over your Mealie library.
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
              <Button
                variant="outline"
                onClick={() => comingSoon("Moving from Mealie", 1)}
              >
                Move from Mealie
              </Button>
            </div>
          </EmptyContent>
        </Empty>
      ) : recipes.data.length === 0 ? (
        <p className="py-10 text-center text-muted-foreground">
          Nothing matches that. Try another word or tag.
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {recipes.data.map((recipe) => (
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
