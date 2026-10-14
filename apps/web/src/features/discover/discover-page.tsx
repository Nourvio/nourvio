import { HugeiconsIcon } from "@hugeicons/react"
import { ArrowLeft01Icon, CookingPotIcon } from "@hugeicons/core-free-icons"
import type { BrowseCollection } from "@mise/shared"
import { Link, useParams } from "react-router"

import { PageHeader } from "@/components/layout/page-header"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { NotFoundPage } from "@/app/not-found-page"

import { FoundRecipeCard } from "./found-recipe-card"
import { useCollections, useImportFound } from "./use-discover"

/** Find recipes: hand-picked collections to start a library from. */
export function DiscoverPage() {
  const collections = useCollections()
  return (
    <>
      <PageHeader
        title="Find recipes"
        description="Hand-picked collections of well-loved recipes. Import the ones you like, or a whole collection at once."
      />
      {collections.isPending ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-72 rounded-3xl" />
          ))}
        </div>
      ) : collections.isError ? (
        <p className="text-muted-foreground">Couldn't load the collections.</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {collections.data.map((collection) => (
            <CollectionCard key={collection.id} collection={collection} />
          ))}
        </div>
      )}
    </>
  )
}

function CollectionCard({ collection }: { collection: BrowseCollection }) {
  const have = collection.recipes.filter((r) => r.inLibrary).length
  const photos = collection.recipes
    .flatMap((recipe) => (recipe.imageUrl ? [recipe.imageUrl] : []))
    .slice(0, 4)
  return (
    <Link
      to={`/discover/${collection.id}`}
      className="group flex flex-col overflow-hidden rounded-3xl border bg-card text-card-foreground transition-shadow outline-none hover:shadow-md focus-visible:ring-[3px] focus-visible:ring-ring/50"
    >
      <div className="grid aspect-[4/3] grid-cols-2 grid-rows-2 gap-0.5 bg-muted">
        {photos.length ? (
          photos.map((src) => (
            <img
              key={src}
              src={src}
              alt=""
              loading="lazy"
              decoding="async"
              className="size-full object-cover"
            />
          ))
        ) : (
          <div className="col-span-2 row-span-2 flex items-center justify-center text-muted-foreground/60">
            <HugeiconsIcon
              icon={CookingPotIcon}
              strokeWidth={1.5}
              className="size-10"
            />
          </div>
        )}
      </div>
      <div className="grid gap-1 p-4">
        <h2 className="font-heading text-xl font-semibold group-hover:underline">
          {collection.title}
        </h2>
        <p className="text-sm text-muted-foreground">
          {collection.description}
        </p>
        <p className="text-xs font-medium text-muted-foreground">
          {collection.recipes.length} recipes
          {have ? ` · ${have} in your library` : ""}
        </p>
      </div>
    </Link>
  )
}

/** One collection: its recipes, imported one at a time or all at once. */
export function CollectionPage() {
  const { id = "" } = useParams()
  const collections = useCollections()
  const found = useImportFound()
  const collection = collections.data?.find((item) => item.id === id)

  if (collections.isPending) {
    return (
      <div className="grid gap-4 pt-6 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 8 }, (_, i) => (
          <Skeleton key={i} className="h-80 rounded-3xl" />
        ))}
      </div>
    )
  }
  if (!collection) return <NotFoundPage />

  const left = collection.recipes.filter((recipe) => !recipe.inLibrary)
  return (
    <>
      <Link
        to="/discover"
        className="mt-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <HugeiconsIcon
          icon={ArrowLeft01Icon}
          strokeWidth={2}
          className="size-4"
        />
        Find recipes
      </Link>
      <PageHeader
        title={collection.title}
        description={collection.description}
        actions={
          left.length > 0 && (
            <Button
              disabled={found.progress !== null}
              onClick={() => found.addAll(collection.recipes)}
            >
              {found.progress && <Spinner data-icon="inline-start" />}
              {found.progress
                ? `Importing ${found.progress.done + 1} of ${found.progress.total}…`
                : `Import ${left.length === collection.recipes.length ? "all " : ""}${left.length}`}
            </Button>
          )
        }
      />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {collection.recipes.map((recipe) => (
          <FoundRecipeCard
            key={recipe.url}
            recipe={recipe}
            importing={found.importing.has(recipe.url)}
            onImport={() => found.add(recipe)}
          />
        ))}
      </div>
    </>
  )
}
