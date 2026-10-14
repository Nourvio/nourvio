import * as React from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import { Alert02Icon, SparklesIcon } from "@hugeicons/core-free-icons"
import { DISCOVER_THEMES, type Discovery } from "@mise/shared"
import { useSearchParams } from "react-router"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { cn } from "@/lib/utils"

import { FoundRecipeCard } from "./found-recipe-card"
import {
  useDiscoveries,
  useImportFound,
  useStartDiscovery,
} from "./use-discover"

const GRID = "grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"

/** Type or pick a theme; the assistant finds recipes for it that suit the household. */
export function DiscoverWithAi() {
  const discoveries = useDiscoveries()
  const start = useStartDiscovery()
  const [params, setParams] = useSearchParams()
  const [theme, setTheme] = React.useState("")

  const list = discoveries.data ?? []
  const selected =
    list.find((item) => item.id === params.get("search")) ?? list[0]
  const busy =
    start.isPending || list.some((item) => item.status === "searching")

  function show(id: string) {
    setParams(
      (current) => {
        current.set("search", id)
        return current
      },
      { replace: true }
    )
  }

  function find(value: string) {
    const trimmed = value.trim()
    if (trimmed.length < 2 || busy) return
    start.mutate(trimmed, {
      onSuccess: (discovery) => {
        setTheme("")
        show(discovery.id)
      },
    })
  }

  return (
    <div className="grid gap-8">
      <section className="grid max-w-3xl gap-3">
        <form
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault()
            find(theme)
          }}
        >
          <Input
            value={theme}
            onChange={(event) => setTheme(event.target.value)}
            placeholder="Cozy fall soups, a new pasta…"
            aria-label="What to look for"
            maxLength={120}
            className="h-10"
          />
          <Button
            type="submit"
            size="lg"
            disabled={busy || theme.trim().length < 2}
          >
            {start.isPending ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <HugeiconsIcon
                icon={SparklesIcon}
                strokeWidth={2}
                data-icon="inline-start"
              />
            )}
            Find recipes
          </Button>
        </form>
        <div className="flex flex-wrap gap-2">
          {DISCOVER_THEMES.map((idea) => (
            <Button
              key={idea}
              variant="outline"
              size="sm"
              className="rounded-full"
              disabled={busy}
              onClick={() => find(idea)}
            >
              {idea}
            </Button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          The assistant searches the web for recipes that fit your household's
          tastes and rules, and Mise checks each one opens. A search takes about
          a minute and costs a few cents.
        </p>
      </section>

      {discoveries.isPending ? (
        <div className={GRID}>
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-80 rounded-3xl" />
          ))}
        </div>
      ) : selected ? (
        <DiscoveryResults
          discovery={selected}
          onRetry={busy ? undefined : () => find(selected.theme)}
        />
      ) : null}

      {list.length > 1 && (
        <section className="grid gap-2">
          <h2 className="text-sm font-medium text-muted-foreground">
            Earlier searches
          </h2>
          <div className="flex flex-wrap gap-2">
            {list.map((item) => (
              <Button
                key={item.id}
                size="sm"
                variant={item.id === selected?.id ? "secondary" : "ghost"}
                className={cn(
                  "rounded-full",
                  item.status === "failed" && "text-muted-foreground"
                )}
                onClick={() => show(item.id)}
              >
                {item.status === "searching" && (
                  <Spinner data-icon="inline-start" />
                )}
                {item.theme}
                {item.status === "done" && (
                  <span className="text-muted-foreground">
                    {item.recipes.length}
                  </span>
                )}
              </Button>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

function DiscoveryResults({
  discovery,
  onRetry,
}: {
  discovery: Discovery
  onRetry?: () => void
}) {
  const found = useImportFound()

  if (discovery.status === "searching") {
    return (
      <section className="grid gap-4" aria-live="polite">
        <div className="flex items-center gap-3">
          <Spinner className="size-5" />
          <div>
            <h2 className="font-heading text-xl font-semibold">
              Finding {discovery.theme.toLowerCase()}…
            </h2>
            <p className="text-sm text-muted-foreground">
              Searching the web and checking each recipe opens. Usually about a
              minute; you can leave this page and come back.
            </p>
          </div>
        </div>
        <div className={GRID}>
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-80 rounded-3xl" />
          ))}
        </div>
      </section>
    )
  }

  if (discovery.status === "failed") {
    return (
      <Alert className="max-w-3xl">
        <HugeiconsIcon icon={Alert02Icon} strokeWidth={2} />
        <AlertTitle>Nothing for “{discovery.theme}”</AlertTitle>
        <AlertDescription className="grid gap-3">
          <p>{discovery.error}</p>
          {onRetry && (
            <Button
              variant="outline"
              size="sm"
              className="w-fit"
              onClick={onRetry}
            >
              Try again
            </Button>
          )}
        </AlertDescription>
      </Alert>
    )
  }

  const left = discovery.recipes.filter((recipe) => !recipe.inLibrary)
  return (
    <section className="grid gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-heading text-2xl font-semibold">
            {discovery.theme}
          </h2>
          <p className="text-sm text-muted-foreground">
            {discovery.recipes.length} found ·{" "}
            {new Date(discovery.createdAt).toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
            })}
          </p>
        </div>
        {left.length > 1 && (
          <Button
            variant="outline"
            disabled={found.progress !== null}
            onClick={() => found.addAll(discovery.recipes)}
          >
            {found.progress && <Spinner data-icon="inline-start" />}
            {found.progress
              ? `Importing ${found.progress.done + 1} of ${found.progress.total}…`
              : `Import all ${left.length}`}
          </Button>
        )}
      </div>
      <div className={GRID}>
        {discovery.recipes.map((recipe) => (
          <FoundRecipeCard
            key={recipe.url}
            recipe={recipe}
            detail={recipe.why}
            importing={found.importing.has(recipe.url)}
            onImport={() => found.add(recipe)}
          />
        ))}
      </div>
    </section>
  )
}
