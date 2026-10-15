import * as React from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  ArrowLeft01Icon,
  ArrowRight01Icon,
  CookingPotIcon,
  PauseIcon,
  PlayIcon,
  Tick02Icon,
} from "@hugeicons/core-free-icons"
import { SUGGESTED_SITES, type SiteRecipe } from "@mise/shared"
import { Link } from "react-router"

import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { formatMinutes } from "@/features/recipes/format"
import { cn } from "@/lib/utils"

import { FollowForm, posted } from "./discover-sites"
import { useFollowSite, useImportFound, useSites } from "./use-discover"

/** How long each recipe stays in the spotlight. */
const ROTATE_MS = 6000

/**
 * New recipes from the sites the household follows, one at a time, moving
 * on by itself. Before any are followed, a few sites to start with.
 */
export function SitesSpotlight() {
  const sites = useSites()
  if (!sites.data) return null
  if (!sites.data.length) return <FollowPrompt />

  const newest = sites.data
    .flatMap((site) => site.recipes)
    .sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""))
  // What's not in the library yet comes first, newest first.
  const fresh = newest.filter((recipe) => !recipe.inLibrary)
  const recipes = [...fresh, ...newest.filter((r) => r.inLibrary)].slice(0, 12)

  return (
    <section aria-labelledby="from-your-sites" className="grid gap-4 pt-6">
      <div className="flex items-baseline justify-between gap-3">
        <h2
          id="from-your-sites"
          className="text-2xl font-semibold tracking-tight"
        >
          From your sites
        </h2>
        <Link
          to="/discover?tab=sites"
          className="flex shrink-0 items-center gap-0.5 text-sm font-semibold text-primary hover:underline"
        >
          {fresh.length ? `All ${fresh.length} new` : "Your sites"}
          <HugeiconsIcon
            icon={ArrowRight01Icon}
            strokeWidth={2}
            className="size-4"
          />
        </Link>
      </div>
      {recipes.length ? (
        <Spotlight recipes={recipes} />
      ) : (
        <p className="rounded-3xl border border-dashed p-6 text-muted-foreground">
          {sites.data.some((site) => site.checking || site.pending)
            ? "Mise is reading your sites' newest posts. Their recipes show up here in a minute or two."
            : "No recipes in your sites' latest posts that Mise can read yet. It looks again every few hours."}
        </p>
      )}
    </section>
  )
}

function Spotlight({ recipes }: { recipes: SiteRecipe[] }) {
  const found = useImportFound()
  const [at, setAt] = React.useState(0)
  // Held while the pointer or focus is on it; stopped with the button.
  const [held, setHeld] = React.useState(false)
  const [stopped, setStopped] = React.useState(
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches
  )
  const count = recipes.length
  const index = at % count
  const recipe = recipes[index]!

  React.useEffect(() => {
    if (held || stopped || count < 2) return
    const timer = setInterval(() => {
      if (!document.hidden) setAt((current) => (current + 1) % count)
    }, ROTATE_MS)
    return () => clearInterval(timer)
  }, [held, stopped, count])

  const go = (next: number) => setAt((next + count) % count)
  const time = formatMinutes(recipe.minutes)
  const when = posted(recipe.publishedAt)

  return (
    <div
      className="grid gap-3"
      aria-roledescription="carousel"
      onPointerEnter={() => setHeld(true)}
      onPointerLeave={() => setHeld(false)}
      onFocus={() => setHeld(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setHeld(false)
      }}
    >
      <article
        key={recipe.url}
        aria-roledescription="slide"
        aria-label={`${index + 1} of ${count}`}
        className="animate-in overflow-hidden rounded-3xl border bg-card text-card-foreground duration-500 fade-in motion-reduce:animate-none sm:flex"
      >
        <a
          href={recipe.url}
          target="_blank"
          rel="noreferrer"
          tabIndex={-1}
          className="block shrink-0 sm:w-[45%]"
        >
          {recipe.imageUrl ? (
            <img
              src={recipe.imageUrl}
              alt=""
              decoding="async"
              className="aspect-[16/10] w-full bg-muted object-cover sm:aspect-auto sm:h-full sm:min-h-72"
            />
          ) : (
            <div className="flex aspect-[16/10] w-full items-center justify-center bg-secondary text-muted-foreground/60 sm:aspect-auto sm:h-full sm:min-h-72">
              <HugeiconsIcon
                icon={CookingPotIcon}
                strokeWidth={1.5}
                className="size-12"
              />
            </div>
          )}
        </a>
        <div className="grid min-w-0 flex-1 content-center gap-3 p-6 md:p-8">
          <p className="text-xs font-semibold tracking-wide text-primary uppercase">
            {[recipe.site, when].filter(Boolean).join(" · ")}
          </p>
          <h3 className="font-heading text-2xl leading-tight font-semibold md:text-3xl">
            <a
              href={recipe.url}
              target="_blank"
              rel="noreferrer"
              className="hover:underline"
            >
              {recipe.title}
            </a>
          </h3>
          {(recipe.description || time) && (
            <p className="line-clamp-3 text-muted-foreground">
              {[recipe.description, time].filter(Boolean).join(" · ")}
            </p>
          )}
          <div className="flex flex-wrap gap-2 pt-1">
            {recipe.inLibrary ? (
              <Button variant="outline" asChild>
                <Link to={`/recipes/${recipe.inLibrary.slug}`}>
                  <HugeiconsIcon
                    icon={Tick02Icon}
                    strokeWidth={2}
                    data-icon="inline-start"
                    className="text-primary"
                  />
                  In your library
                </Link>
              </Button>
            ) : (
              <Button
                disabled={found.importing.has(recipe.url)}
                onClick={() => found.add(recipe)}
              >
                {found.importing.has(recipe.url) && (
                  <Spinner data-icon="inline-start" />
                )}
                {found.importing.has(recipe.url) ? "Importing…" : "Import"}
              </Button>
            )}
            <Button variant="outline" asChild>
              <a href={recipe.url} target="_blank" rel="noreferrer">
                Open on the site
              </a>
            </Button>
          </div>
          {count > 1 && (
            <div className="flex flex-wrap items-center gap-2 pt-2">
              <Button
                variant="outline"
                size="icon-sm"
                className="rounded-full"
                aria-label="Previous recipe"
                onClick={() => go(index - 1)}
              >
                <HugeiconsIcon icon={ArrowLeft01Icon} strokeWidth={2} />
              </Button>
              <div className="flex items-center gap-1.5">
                {recipes.map((r, i) => (
                  <button
                    key={r.url}
                    type="button"
                    aria-label={`Show ${r.title}`}
                    aria-current={i === index}
                    onClick={() => go(i)}
                    className={cn(
                      "h-2 rounded-full transition-all outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
                      i === index
                        ? "w-5 bg-primary"
                        : "w-2 bg-border hover:bg-muted-foreground/40"
                    )}
                  />
                ))}
              </div>
              <Button
                variant="outline"
                size="icon-sm"
                className="rounded-full"
                aria-label="Next recipe"
                onClick={() => go(index + 1)}
              >
                <HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={2} />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                className="rounded-full text-muted-foreground"
                aria-label={stopped ? "Move on by itself" : "Stop moving on"}
                aria-pressed={!stopped}
                onClick={() => setStopped((value) => !value)}
              >
                <HugeiconsIcon
                  icon={stopped ? PlayIcon : PauseIcon}
                  strokeWidth={2}
                />
              </Button>
            </div>
          )}
        </div>
      </article>

      {count > 2 && (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4]
            .filter((step) => step < count)
            .map((step) => {
              const i = (index + step) % count
              const next = recipes[i]!
              return (
                <button
                  key={next.url}
                  type="button"
                  onClick={() => go(i)}
                  className="flex min-w-0 items-center gap-3 rounded-2xl border bg-card p-2 text-left transition-colors outline-none hover:bg-accent/50 focus-visible:ring-[3px] focus-visible:ring-ring/50"
                >
                  {next.imageUrl ? (
                    <img
                      src={next.imageUrl}
                      alt=""
                      loading="lazy"
                      decoding="async"
                      className="size-12 shrink-0 rounded-xl bg-muted object-cover"
                    />
                  ) : (
                    <span className="size-12 shrink-0 rounded-xl bg-secondary" />
                  )}
                  <span className="grid min-w-0">
                    <span className="truncate text-xs text-muted-foreground">
                      {next.site}
                    </span>
                    <span className="truncate text-sm font-medium">
                      {next.title}
                    </span>
                  </span>
                </button>
              )
            })}
        </div>
      )}
    </div>
  )
}

/** Before any site is followed: what this is for, and a few to start with. */
function FollowPrompt() {
  const follow = useFollowSite()
  return (
    <section
      aria-labelledby="follow-sites"
      className="mt-6 grid gap-5 rounded-3xl bg-accent/50 p-6 md:p-7"
    >
      <div className="grid max-w-2xl gap-1">
        <h2 id="follow-sites" className="text-2xl font-semibold tracking-tight">
          Fresh recipes from sites you like
        </h2>
        <p className="text-muted-foreground">
          Follow a few recipe sites and their newest recipes show up here, ready
          to import with a tap. Mise checks them every few hours.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {SUGGESTED_SITES.slice(0, 4).map((site) => (
          <div
            key={site.feedUrl}
            className="flex flex-col gap-1.5 rounded-2xl bg-card p-4 text-card-foreground"
          >
            <span className="font-semibold">{site.name}</span>
            <span className="text-sm text-muted-foreground">
              {site.description}
            </span>
            <Button
              size="sm"
              variant="outline"
              className="mt-auto self-start rounded-full"
              disabled={follow.isPending}
              onClick={() => follow.mutate(site.url)}
            >
              {follow.isPending && follow.variables === site.url && (
                <Spinner data-icon="inline-start" />
              )}
              Follow
            </Button>
          </div>
        ))}
      </div>
      <div className="max-w-lg">
        <FollowForm
          onFollow={(url, done) => follow.mutate(url, { onSuccess: done })}
          pending={follow.isPending}
        />
      </div>
    </section>
  )
}
