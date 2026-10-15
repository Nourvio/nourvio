import * as React from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import { Cancel01Icon, RssIcon } from "@hugeicons/core-free-icons"
import {
  SUGGESTED_SITES,
  type FollowedSite,
  type SuggestedSite,
} from "@mise/shared"
import { useSearchParams } from "react-router"

import { Panel, WithAside } from "@/components/layout/page-layout"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { cn } from "@/lib/utils"

import { FoundRecipeCard } from "./found-recipe-card"
import {
  useFollowSite,
  useImportFound,
  useSites,
  useUnfollowSite,
} from "./use-discover"

const GRID = "grid gap-4 sm:grid-cols-2 xl:grid-cols-3"

/** When a post went up: "Today", "3 days ago", "Oct 2". */
export function posted(iso: string | null) {
  if (!iso) return undefined
  const date = new Date(iso)
  const start = (d: Date) =>
    new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const days = Math.round((start(new Date()) - start(date)) / 86_400_000)
  if (days <= 0) return "Today"
  if (days === 1) return "Yesterday"
  if (days < 7) return `${days} days ago`
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" })
}

/** Recipe sites the household follows: their newest recipes, ready to import. */
export function FollowSites() {
  const sites = useSites()
  const follow = useFollowSite()
  const [params, setParams] = useSearchParams()

  const list = sites.data ?? []
  const following = new Set(list.map((site) => site.feedUrl))
  const suggestions = SUGGESTED_SITES.filter(
    (site) => !following.has(site.feedUrl)
  )

  if (sites.isPending) {
    return (
      <div className={GRID}>
        {Array.from({ length: 3 }, (_, i) => (
          <Skeleton key={i} className="h-80 rounded-3xl" />
        ))}
      </div>
    )
  }

  const followForm = (
    <FollowForm
      onFollow={(url, done) => follow.mutate(url, { onSuccess: done })}
      pending={follow.isPending}
    />
  )

  if (!list.length) {
    return (
      <div className="grid gap-6">
        <div className="grid max-w-2xl gap-2">
          <h2 className="font-heading text-2xl font-semibold">
            Follow your favorite recipe sites
          </h2>
          <p className="text-muted-foreground">
            Their newest recipes show up here, ready to import. Start with some
            of these, or paste any site's address.
          </p>
          {followForm}
        </div>
        <div className={GRID}>
          {suggestions.map((site) => (
            <SuggestionCard
              key={site.feedUrl}
              site={site}
              pending={follow.isPending && follow.variables === site.url}
              onFollow={() => follow.mutate(site.url)}
            />
          ))}
        </div>
      </div>
    )
  }

  const filter = list.find((site) => site.id === params.get("site"))
  return (
    <WithAside
      aside={
        <>
          <Panel title="Your sites">
            <ul className="grid gap-1">
              {list.map((site) => (
                <FollowedRow key={site.id} site={site} />
              ))}
            </ul>
          </Panel>
          <Panel title="Follow a site">
            {followForm}
            {suggestions.length > 0 && (
              <ul className="grid gap-3 pt-1">
                {suggestions.map((site) => (
                  <li
                    key={site.feedUrl}
                    className="flex items-start justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{site.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {site.description}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={follow.isPending}
                      onClick={() => follow.mutate(site.url)}
                    >
                      {follow.isPending && follow.variables === site.url && (
                        <Spinner data-icon="inline-start" />
                      )}
                      Follow
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </>
      }
    >
      <SiteRecipes
        sites={list}
        filter={filter}
        onFilter={(id) =>
          setParams(
            (current) => {
              if (id) current.set("site", id)
              else current.delete("site")
              return current
            },
            { replace: true }
          )
        }
      />
    </WithAside>
  )
}

function SiteRecipes({
  sites,
  filter,
  onFilter,
}: {
  sites: FollowedSite[]
  filter: FollowedSite | undefined
  onFilter: (id: string | null) => void
}) {
  const found = useImportFound()
  const shown = filter ? [filter] : sites
  const recipes = shown
    .flatMap((site) => site.recipes)
    .sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""))
    .slice(0, 48)
  const opening = shown
    .filter((site) => site.checking)
    .reduce((count, site) => count + site.pending, 0)

  return (
    <section className="grid gap-4">
      <div className="grid gap-3">
        <h2 className="font-heading text-2xl font-semibold">
          New from {filter ? filter.name : "your sites"}
        </h2>
        {sites.length > 1 && (
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant={filter ? "ghost" : "secondary"}
              className="rounded-full"
              onClick={() => onFilter(null)}
            >
              All
            </Button>
            {sites.map((site) => (
              <Button
                key={site.id}
                size="sm"
                variant={filter?.id === site.id ? "secondary" : "ghost"}
                className="rounded-full"
                onClick={() =>
                  onFilter(filter?.id === site.id ? null : site.id)
                }
              >
                {site.name}
              </Button>
            ))}
          </div>
        )}
        {opening > 0 && (
          <p
            className="flex items-center gap-2 text-sm text-muted-foreground"
            aria-live="polite"
          >
            <Spinner />
            Opening {opening} new {opening === 1 ? "post" : "posts"} to find the
            recipes, a few seconds apart…
          </p>
        )}
      </div>
      {recipes.length ? (
        <div className={GRID}>
          {recipes.map((recipe) => (
            <FoundRecipeCard
              key={recipe.url}
              recipe={recipe}
              detail={posted(recipe.publishedAt)}
              importing={found.importing.has(recipe.url)}
              onImport={() => found.add(recipe)}
            />
          ))}
        </div>
      ) : (
        opening === 0 && (
          <p className="text-muted-foreground">
            No recipes in {filter ? "this site's" : "these sites'"} latest posts
            that Nourvio can read. Some sites don't share recipe details, or
            turn Nourvio away; it tries again every few hours.
          </p>
        )
      )}
    </section>
  )
}

function FollowedRow({ site }: { site: FollowedSite }) {
  const unfollow = useUnfollowSite()
  return (
    <li className="flex items-center justify-between gap-2">
      <div className="min-w-0">
        <a
          href={site.url}
          target="_blank"
          rel="noreferrer"
          className="block truncate text-sm font-medium hover:underline"
        >
          {site.name}
        </a>
        <p
          className={cn(
            "truncate text-xs text-muted-foreground",
            site.error && "text-destructive"
          )}
        >
          {site.error ??
            `${site.recipes.length} ${site.recipes.length === 1 ? "recipe" : "recipes"}${site.pending ? `, ${site.pending} to check` : ""}`}
        </p>
      </div>
      <Button
        size="icon-sm"
        variant="ghost"
        aria-label={`Stop following ${site.name}`}
        disabled={unfollow.isPending}
        onClick={() => unfollow.mutate(site)}
      >
        <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} />
      </Button>
    </li>
  )
}

export function FollowForm({
  onFollow,
  pending,
}: {
  onFollow: (url: string, done: () => void) => void
  pending: boolean
}) {
  const [url, setUrl] = React.useState("")
  return (
    <form
      className="flex gap-2"
      onSubmit={(event) => {
        event.preventDefault()
        if (url.trim().length >= 3) onFollow(url.trim(), () => setUrl(""))
      }}
    >
      <Input
        value={url}
        onChange={(event) => setUrl(event.target.value)}
        placeholder="cookieandkate.com"
        aria-label="A recipe site's address"
        inputMode="url"
        maxLength={500}
      />
      <Button type="submit" disabled={pending || url.trim().length < 3}>
        {pending ? (
          <Spinner data-icon="inline-start" />
        ) : (
          <HugeiconsIcon
            icon={RssIcon}
            strokeWidth={2}
            data-icon="inline-start"
          />
        )}
        Follow
      </Button>
    </form>
  )
}

function SuggestionCard({
  site,
  pending,
  onFollow,
}: {
  site: SuggestedSite
  pending: boolean
  onFollow: () => void
}) {
  return (
    <div className="flex flex-col gap-2 rounded-3xl border bg-card p-5 text-card-foreground">
      <a
        href={site.url}
        target="_blank"
        rel="noreferrer"
        className="font-heading text-lg font-semibold hover:underline"
      >
        {site.name}
      </a>
      <p className="text-sm text-muted-foreground">{site.description}</p>
      <div className="mt-auto pt-2">
        <Button
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={onFollow}
        >
          {pending && <Spinner data-icon="inline-start" />}
          Follow
        </Button>
      </div>
    </div>
  )
}
