import * as React from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  CookBookIcon,
  RefreshIcon,
  SparklesIcon,
} from "@hugeicons/core-free-icons"
import {
  addDays,
  DEFAULT_MEALS,
  MEAL_NAMES,
  MEALS,
  startOfWeek,
  toIsoDate,
  whyUseSoon,
  type Meal,
  type MealSuggestion,
  type PlanEntry,
  type RecipeSummary,
  type SiteRecipe,
} from "@mise/shared"
import { Link } from "react-router"
import { toast } from "sonner"

import { SectionHeading } from "@/components/layout/page-layout"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { useCurrentUser } from "@/features/auth/current-user"
import { SitesSpotlight } from "@/features/discover/sites-spotlight"
import { useImportAndPlan, useSites } from "@/features/discover/use-discover"
import { useList, useListPrices } from "@/features/list/use-list"
import { soonWhen, urgency } from "@/features/pantry/soon"
import { usePantry } from "@/features/pantry/use-pantry"
import { dayName, fromIsoDate, today, weekLabel } from "@/features/plan/dates"
import {
  Fact,
  findNextMeal,
  HERO_PHOTO,
  HeroFrame,
  NextMealCard,
  TodayLine,
  useMinute,
  WhenBadge,
} from "@/features/plan/next-meal"
import {
  useAddPlanEntry,
  useMealSuggestions,
  usePlan,
  useSuggestMeal,
} from "@/features/plan/use-plan"
import { formatMinutes, formatRelativeDate } from "@/features/recipes/format"
import { RecipeImage } from "@/features/recipes/recipe-image"
import { useRecipes } from "@/features/recipes/use-recipes"
import { useHouseholdInfo } from "@/features/settings/use-household"
import { onSaleText } from "@/features/shop/sale-text"
import { ApiError } from "@/lib/api"
import { cn } from "@/lib/utils"

const LONG_DATE = new Intl.DateTimeFormat(undefined, {
  weekday: "long",
  month: "long",
  day: "numeric",
})

const dollars = (value: number) =>
  value.toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  })

/** "spinach", "spinach and milk", "spinach, milk and lemon". */
const listed = (names: string[]) =>
  names.length > 1
    ? `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`
    : (names[0] ?? "")

/**
 * Today at a glance: the next meal, big (or an idea for tonight when
 * nothing's planned), the week, the list and the pantry in three tiles,
 * the rest of the week, what's new on the sites you follow, and recipes
 * worth making again.
 */
export function HomePage() {
  const me = useCurrentUser()
  const now = today()
  const plan = usePlan(now, addDays(now, 6))
  const recipes = useRecipes()
  const household = useHouseholdInfo()
  const meals = household.data?.meals ?? DEFAULT_MEALS
  const minute = useMinute()
  const hour = minute.getHours()
  const greeting =
    hour < 5 || hour >= 17
      ? "Good evening"
      : hour < 12
        ? "Good morning"
        : "Good afternoon"
  const firstName = me.displayName.trim().split(/\s+/)[0]

  const entries = [...(plan.data ?? [])].sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      MEALS.indexOf(a.meal) - MEALS.indexOf(b.meal) ||
      a.position - b.position
  )
  const todays = entries.filter((entry) => entry.date === now)
  // Today's next meal first; with dinner unplanned, an idea for tonight;
  // after that, the next day's.
  const nextToday = findNextMeal(todays, minute)
  const wantIdea =
    plan.isSuccess &&
    !nextToday &&
    meals.includes("dinner") &&
    !todays.some((entry) => entry.meal === "dinner") &&
    hour < 21
  const upNext = nextToday ?? (wantIdea ? null : findNextMeal(entries, minute))
  const others = todays.filter((entry) => entry !== upNext)
  const libraryEmpty = recipes.data?.length === 0

  return (
    <div className="grid gap-8 pt-2 md:pt-4">
      <header className="space-y-1">
        <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">
          {greeting}
          {firstName ? `, ${firstName}` : ""}
        </h1>
        <p className="text-muted-foreground">
          {LONG_DATE.format(fromIsoDate(now))}
        </p>
      </header>

      <AutoPlanNote />

      {libraryEmpty ? (
        <Welcome isServerAdmin={me.isServerAdmin} />
      ) : (
        <>
          <section aria-labelledby="today-heading" className="grid gap-3">
            <h2 id="today-heading" className="sr-only">
              Today
            </h2>
            {plan.isPending ? (
              <Skeleton className="h-96 rounded-3xl" />
            ) : upNext ? (
              <NextMealCard
                entry={upNext}
                headingLevel={3}
                large
                others={others}
                othersLabel={upNext.date === now ? "Also today" : "Today"}
              />
            ) : wantIdea ? (
              <TonightIdeas date={now} others={others} />
            ) : (
              <NothingAhead others={others} />
            )}
          </section>

          <Glance meals={meals} weekStart={household.data?.weekStart ?? 0} />

          <RestOfWeek
            entries={entries.filter((entry) => entry.date > now)}
            loading={plan.isPending}
            weekStart={household.data?.weekStart ?? 0}
          />

          <SitesSpotlight />

          <Shelves recipes={recipes.data} />
        </>
      )}
    </div>
  )
}

type IdeaSource = "both" | "mine" | "sites"

const SOURCES: { id: IdeaSource; label: string }[] = [
  { id: "both", label: "Both" },
  { id: "mine", label: "Your recipes" },
  { id: "sites", label: "Your sites" },
]

/**
 * Nothing planned for dinner: one idea at a time, from your recipes (using
 * up what needs using first) or new on the sites you follow, planned with a
 * tap. "Both" takes turns.
 */
function TonightIdeas({ date, others }: { date: string; others: PlanEntry[] }) {
  const id = React.useId()
  const sites = useSites()
  const first = useMealSuggestions([{ date, meal: "dinner" }])
  const suggest = useSuggestMeal()
  const add = useAddPlanEntry()
  const importAndPlan = useImportAndPlan()
  const [source, setSource] = React.useState<IdeaSource>("both")
  const [step, setStep] = React.useState(0)
  const [picked, setPicked] = React.useState<MealSuggestion[]>([])
  const [mineDone, setMineDone] = React.useState(false)

  const fromSites = (sites.data ?? [])
    .flatMap((site) => site.recipes)
    .filter((recipe) => !recipe.inLibrary)
    .sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""))
  const firstMine = first.data?.[0] ?? null
  const mine = picked.at(-1) ?? firstMine
  const noMine = mineDone || (first.isSuccess && !firstMine)
  const hasSites = fromSites.length > 0
  // Without sites (or library ideas), the switch has nothing to switch.
  const mode: IdeaSource = !hasSites ? "mine" : noMine ? "sites" : source
  const showSite = mode === "sites" || (mode === "both" && step % 2 === 1)
  const site: SiteRecipe | null = hasSites
    ? fromSites[
        (mode === "both" ? Math.floor(step / 2) : step) % fromSites.length
      ]!
    : null

  function nextMine() {
    const seen = [firstMine, ...picked].filter(Boolean).map((s) => s!.recipe.id)
    suggest.mutate(
      { slots: [{ date, meal: "dinner" }], exclude: seen.slice(-100) },
      {
        onSuccess: ([suggestion]) => {
          if (suggestion) {
            setPicked((current) => [...current, suggestion])
            return
          }
          setMineDone(true)
          if (!hasSites) {
            toast("That's every idea for tonight. More recipes, more variety.")
          }
        },
        onError: () => toast.error("Couldn't come up with an idea"),
      }
    )
  }

  function another() {
    const next = step + 1
    setStep(next)
    if (mode === "mine" || (mode === "both" && next % 2 === 0)) nextMine()
  }

  function failed(error: unknown) {
    toast.error(
      error instanceof ApiError ? error.message : "Couldn't plan that"
    )
  }

  function planMine(suggestion: MealSuggestion) {
    add.mutate(
      {
        date,
        meal: "dinner",
        recipeId: suggestion.recipe.id,
        withRecipeId: suggestion.with?.id ?? null,
      },
      {
        onSuccess: () =>
          toast.success(`${suggestion.recipe.name} is on for tonight`),
        onError: failed,
      }
    )
  }

  function planSite(recipe: SiteRecipe) {
    importAndPlan.mutate(
      { url: recipe.url, date, meal: "dinner" },
      {
        onSuccess: (saved) =>
          toast.success(`${saved.name} is in your library and on for tonight`),
        onError: failed,
      }
    )
  }

  if (first.isPending && !hasSites) {
    return <Skeleton className="h-96 rounded-3xl" />
  }

  if (!mine && !site) {
    return (
      <article className="grid gap-4 rounded-3xl border border-dashed bg-card p-6 text-card-foreground md:p-8">
        <div className="grid gap-1">
          <h3 className="font-heading text-2xl font-semibold">
            What's for dinner?
          </h3>
          <p className="text-muted-foreground">
            No ideas right now. Add a few more recipes, or follow a recipe site
            for new ones.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" asChild>
            <Link to="/plan">Open the plan</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link to="/discover?tab=sites">Follow a site</Link>
          </Button>
        </div>
        <TodayLine label="Today" entries={others} />
      </article>
    )
  }

  const busy = add.isPending || importAndPlan.isPending || suggest.isPending
  // A site idea when it's its turn, or while the first idea from the library loads.
  const onSite = site && (showSite || !mine) ? site : null
  const time = onSite
    ? formatMinutes(onSite.minutes)
    : formatMinutes(mine?.recipe.totalMinutes)

  return (
    <HeroFrame
      labelledBy={id}
      large
      photo={
        onSite ? (
          onSite.imageUrl ? (
            <img
              src={onSite.imageUrl}
              alt=""
              decoding="async"
              className={cn(HERO_PHOTO, "object-cover")}
            />
          ) : null
        ) : (
          mine?.recipe.thumbnailUrl && (
            <RecipeImage
              src={mine.recipe.thumbnailUrl}
              alt=""
              eager
              className={HERO_PHOTO}
            />
          )
        )
      }
    >
      <div className="grid gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <WhenBadge large>An idea for tonight</WhenBadge>
          {hasSites && !noMine && (
            <div
              role="group"
              aria-label="Ideas from"
              className="flex gap-0.5 rounded-full bg-muted p-0.5"
            >
              {SOURCES.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  aria-pressed={mode === option.id}
                  onClick={() => {
                    setSource(option.id)
                    setStep(0)
                  }}
                  className={cn(
                    "h-7 rounded-full px-3 text-xs font-medium transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
                    mode === option.id
                      ? "bg-card font-semibold shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
          )}
        </div>
        <p className="text-sm font-semibold text-primary">
          {onSite
            ? `New from ${onSite.site}`
            : mine?.uses.length
              ? `Uses up your ${listed(mine.uses.map((u) => u.toLowerCase()))}`
              : mine?.theme?.fits
                ? `It's ${mine.theme.name.toLowerCase()}`
                : mine?.onSale.length
                  ? onSaleText(mine.onSale)
                  : "From your recipes"}
        </p>
        <h3
          id={id}
          className="font-heading text-3xl leading-tight font-semibold tracking-tight md:text-[2.4rem]"
        >
          {onSite ? (
            <a
              href={onSite.url}
              target="_blank"
              rel="noreferrer"
              className="hover:underline"
            >
              {onSite.title}
            </a>
          ) : (
            <Link
              to={`/recipes/${mine!.recipe.slug}${mine!.with ? `?with=${mine!.with.slug}` : ""}`}
              className="hover:underline"
            >
              {mine!.recipe.name}
              {mine!.with && (
                <span className="font-normal text-muted-foreground">
                  {" "}
                  with {mine!.with.name}
                </span>
              )}
            </Link>
          )}
        </h3>
        {onSite && onSite.description && (
          <p className="line-clamp-2 text-muted-foreground">
            {onSite.description}
          </p>
        )}
        {(time || (!onSite && mine?.recipe.servings)) && (
          <div className="flex flex-wrap gap-1.5">
            {time && <Fact>{time}</Fact>}
            {!onSite && mine?.recipe.servings && (
              <Fact>{mine.recipe.servings} servings</Fact>
            )}
          </div>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          size="lg"
          className="h-12 px-6"
          disabled={busy}
          onClick={() => (onSite ? planSite(onSite) : planMine(mine!))}
        >
          {(add.isPending || importAndPlan.isPending) && (
            <Spinner data-icon="inline-start" />
          )}
          {onSite ? "Import and plan for tonight" : "Plan it for tonight"}
        </Button>
        <Button
          size="lg"
          variant="outline"
          className="h-12 px-5"
          disabled={busy}
          onClick={another}
        >
          <HugeiconsIcon
            icon={RefreshIcon}
            strokeWidth={2}
            data-icon="inline-start"
          />
          Another idea
        </Button>
      </div>
      <TodayLine label="Today" entries={others} />
    </HeroFrame>
  )
}

/** Nothing planned in the week ahead. */
function NothingAhead({ others }: { others: PlanEntry[] }) {
  return (
    <article className="grid gap-3 rounded-3xl border border-dashed bg-card p-6 text-card-foreground md:p-8">
      <h3 className="font-heading text-2xl font-semibold">
        {others.length ? "That's today done" : "Nothing planned"}
      </h3>
      <p className="text-muted-foreground">
        Nothing's planned for the week ahead yet.
      </p>
      <div>
        <Button variant="outline" asChild>
          <Link to="/plan">Open the plan</Link>
        </Button>
      </div>
      <TodayLine label="Today" entries={others} />
    </article>
  )
}

const MEAL_PRIORITY: Meal[] = ["dinner", "lunch", "breakfast", "snack"]

/** The week, the list and the pantry, each in a tile that opens its page. */
function Glance({ meals, weekStart }: { meals: Meal[]; weekStart: 0 | 1 }) {
  const now = today()
  const start = startOfWeek(now, weekStart)
  const end = addDays(start, 6)
  const week = usePlan(start, end)
  const list = useList()
  const prices = useListPrices().data ?? {}
  const pantry = usePantry()

  const filled = new Set(
    (week.data ?? [])
      .filter((entry) => meals.includes(entry.meal))
      .map((entry) => `${entry.date}|${entry.meal}`)
  )
  // The first open meal from tomorrow on: dinners first, as the meal most
  // households plan, then lunches, then the rest.
  let open: string | null = null
  for (const meal of MEAL_PRIORITY.filter((m) => meals.includes(m))) {
    for (let date = addDays(now, 1); date <= end; date = addDays(date, 1)) {
      if (filled.has(`${date}|${meal}`)) continue
      open = `${dayName(date)}'s ${MEAL_NAMES[meal].toLowerCase()} is open`
      break
    }
    if (open) break
  }

  const left = (list.data ?? []).filter((item) => !item.checked)
  const cost = left.reduce(
    (sum, item) => sum + (prices[item.id]?.total ?? 0),
    0
  )
  const soon = (pantry.data ?? [])
    .map((item) => ({ item, soon: whyUseSoon(item, now) }))
    .filter((row) => row.soon)
    .sort((a, b) => urgency(a.soon!) - urgency(b.soon!))

  const tiles = [
    {
      to: "/plan",
      label: "This week",
      value: `${filled.size} of ${meals.length * 7} planned`,
      detail: open ?? "The rest of the week is planned",
      warn: false,
    },
    {
      to: "/list",
      label: "Shopping",
      value: left.length
        ? `${left.length} to buy${cost ? ` · about ${dollars(cost)}` : ""}`
        : "Nothing to buy",
      detail: left.length
        ? listed(left.slice(0, 3).map((item) => item.name))
        : "Add the week's meals from the plan",
      warn: false,
    },
    ...(soon.length
      ? [
          {
            to: "/pantry",
            label: "Use soon",
            value: soon[0]!.item.name,
            detail: `${soonWhen(soon[0]!.soon!)}${soon.length > 1 ? `, and ${soon.length - 1} more` : ""}`,
            warn: true,
          },
        ]
      : []),
  ]

  return (
    <div className="grid gap-3 sm:auto-cols-fr sm:grid-flow-col">
      {tiles.map((tile) => (
        <Link
          key={tile.to}
          to={tile.to}
          className={cn(
            "grid content-start gap-1 rounded-3xl border bg-card p-5 text-card-foreground transition-colors outline-none hover:bg-accent/40 focus-visible:ring-[3px] focus-visible:ring-ring/50",
            tile.warn && "border-amber-500/30 bg-amber-500/[0.07]"
          )}
        >
          <span
            className={cn(
              "text-xs font-semibold tracking-wide text-muted-foreground uppercase",
              tile.warn && "text-amber-700 dark:text-amber-400"
            )}
          >
            {tile.label}
          </span>
          <span className="font-heading text-2xl font-semibold first-letter:uppercase">
            {tile.value}
          </span>
          <span className="truncate text-sm text-muted-foreground first-letter:uppercase">
            {tile.detail}
          </span>
        </Link>
      ))}
    </div>
  )
}

/** The days left this week (or the next few), a card each. */
function RestOfWeek({
  entries,
  loading,
  weekStart,
}: {
  entries: PlanEntry[]
  loading: boolean
  weekStart: 0 | 1
}) {
  const now = today()
  const end = addDays(startOfWeek(now, weekStart), 6)
  let days: string[] = []
  for (let date = addDays(now, 1); date <= end; date = addDays(date, 1)) {
    days.push(date)
  }
  // Near the end of the week, the next few days instead.
  const thisWeek = days.length >= 3
  if (!thisWeek) days = [1, 2, 3].map((n) => addDays(now, n))

  return (
    <section aria-labelledby="week-heading" className="grid gap-3">
      <SectionHeading id="week-heading" to="/plan" link="Plan">
        {thisWeek ? "The rest of the week" : "Coming up"}
      </SectionHeading>
      {loading ? (
        <Skeleton className="h-28 rounded-3xl" />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {days.map((date) => {
            const dayEntries = entries.filter((entry) => entry.date === date)
            const main =
              dayEntries.find((entry) => entry.meal === "dinner") ??
              dayEntries[0]
            const rest = dayEntries.filter((entry) => entry !== main)
            return (
              <li key={date}>
                <Link
                  to={`/plan?week=${startOfWeek(date, weekStart)}`}
                  className="grid h-full content-start gap-1 rounded-3xl border bg-card p-5 text-card-foreground transition-colors outline-none hover:bg-accent/40 focus-visible:ring-[3px] focus-visible:ring-ring/50"
                >
                  <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                    {date === addDays(now, 1) ? "Tomorrow" : dayName(date)}
                  </span>
                  {main ? (
                    <>
                      <span
                        className={cn(
                          "font-semibold",
                          main.status === "skipped" &&
                            "text-muted-foreground line-through"
                        )}
                      >
                        {main.recipe?.name ?? main.note}
                      </span>
                      <span className="text-sm text-muted-foreground">
                        {rest.length
                          ? `and ${rest
                              .map(
                                (entry) =>
                                  `${entry.recipe?.name ?? entry.note} for ${MEAL_NAMES[entry.meal].toLowerCase()}`
                              )
                              .join(", ")}`
                          : MEAL_NAMES[main.meal]}
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="text-muted-foreground">
                        Nothing planned
                      </span>
                      <span className="text-sm font-medium text-primary">
                        Plan it
                      </span>
                    </>
                  )}
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

/** Favorites not made lately, and what's new in the library. */
function Shelves({ recipes }: { recipes: RecipeSummary[] | undefined }) {
  if (!recipes) {
    return <Skeleton className="h-48 rounded-3xl" />
  }
  // Not made in the last three weeks.
  const cutoff = addDays(today(), -21)
  const again = recipes
    .filter(
      (recipe) =>
        (recipe.rating ?? 0) >= 4 &&
        (!recipe.lastMadeAt || toIsoDate(new Date(recipe.lastMadeAt)) < cutoff)
    )
    .sort(
      (a, b) =>
        (b.rating ?? 0) - (a.rating ?? 0) ||
        (a.lastMadeAt ? Date.parse(a.lastMadeAt) : 0) -
          (b.lastMadeAt ? Date.parse(b.lastMadeAt) : 0)
    )
    .slice(0, 6)
  const recent = [...recipes]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 6)

  return (
    <div className="grid gap-8">
      {again.length > 0 && (
        <Shelf
          id="again-heading"
          title="Cook again"
          recipes={again}
          detail={(recipe) =>
            recipe.lastMadeAt
              ? `Made ${formatRelativeDate(recipe.lastMadeAt)}`
              : "Not made yet"
          }
        />
      )}
      <Shelf
        id="recent-heading"
        title="Recently added"
        link={{ to: "/recipes", label: "All recipes" }}
        recipes={recent}
        detail={(recipe) => `Added ${formatRelativeDate(recipe.createdAt)}`}
      />
    </div>
  )
}

function Shelf({
  id,
  title,
  link,
  recipes,
  detail,
}: {
  id: string
  title: string
  link?: { to: string; label: string }
  recipes: RecipeSummary[]
  detail: (recipe: RecipeSummary) => string
}) {
  return (
    <section aria-labelledby={id} className="grid gap-3">
      <SectionHeading id={id} to={link?.to} link={link?.label}>
        {title}
      </SectionHeading>
      {/* A row to swipe through on a phone, a grid on bigger screens. */}
      <ul className="-mx-4 flex snap-x scroll-px-4 [scrollbar-width:none] gap-3 overflow-x-auto px-4 pb-2 md:mx-0 md:grid md:grid-cols-3 md:overflow-visible md:px-0 md:pb-0 lg:grid-cols-6">
        {recipes.map((recipe) => (
          <li key={recipe.id} className="w-40 shrink-0 snap-start md:w-auto">
            <Link
              to={`/recipes/${recipe.slug}`}
              className="group grid gap-2 rounded-2xl outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
            >
              <RecipeImage
                src={recipe.thumbnailUrl}
                alt=""
                className="aspect-[4/3] w-full rounded-2xl transition-opacity group-hover:opacity-90 [&_svg]:size-8"
              />
              <div className="grid gap-0.5 px-0.5">
                <span className="line-clamp-2 leading-snug font-medium group-hover:underline">
                  {recipe.name}
                </span>
                <span className="text-xs text-muted-foreground">
                  {detail(recipe)}
                </span>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}

/** A new household: where to start. */
function Welcome({ isServerAdmin }: { isServerAdmin: boolean }) {
  const steps = [
    {
      title: "Add your recipes",
      text: "Start from a hand-picked collection, paste a link from any recipe site, or snap a cookbook page.",
    },
    {
      title: "Plan the week",
      text: "Pick meals for each day, or let Nourvio fill the week from your recipes.",
    },
    {
      title: "Shop and cook",
      text: "Turn the plan into a shopping list, then cook step by step.",
    },
  ]
  return (
    <section className="grid gap-6 rounded-3xl border bg-card p-6 text-card-foreground md:p-8">
      <div className="flex items-center gap-3">
        <span className="flex size-12 items-center justify-center rounded-2xl bg-accent text-accent-foreground">
          <HugeiconsIcon icon={CookBookIcon} strokeWidth={2} />
        </span>
        <div>
          <h2 className="font-heading text-2xl font-semibold">
            Welcome to Nourvio
          </h2>
          <p className="text-muted-foreground">Three steps to dinner.</p>
        </div>
      </div>
      <ol className="grid gap-4 md:grid-cols-3">
        {steps.map((step, i) => (
          <li key={step.title} className="grid content-start gap-1">
            <span className="text-sm font-semibold text-primary">{i + 1}</span>
            <span className="font-medium">{step.title}</span>
            <span className="text-sm text-muted-foreground">{step.text}</span>
          </li>
        ))}
      </ol>
      <div className="flex flex-wrap gap-2">
        <Button size="lg" asChild>
          <Link to="/discover">Browse collections</Link>
        </Button>
        <Button size="lg" variant="outline" asChild>
          <Link to="/recipes?import=link">Add a recipe</Link>
        </Button>
        {isServerAdmin && (
          <Button size="lg" variant="outline" asChild>
            <Link to="/settings#mealie">Move from Mealie</Link>
          </Button>
        )}
      </div>
    </section>
  )
}

/** The week Nourvio planned by itself, to look over: shown for a few days after. */
function AutoPlanNote() {
  const household = useHouseholdInfo()
  const last = household.data?.autoPlan.last
  const key = last ? `mise.autoplanSeen.${last.at}` : null
  const [seen, setSeen] = React.useState(() => {
    try {
      return key ? localStorage.getItem(key) === "1" : false
    } catch {
      return false
    }
  })
  if (!last || !key || seen || last.planned === 0) return null
  // Only while it's news: until that week is over, and for a few days at most.
  if (
    addDays(last.week, 6) < today() ||
    addDays(last.at.slice(0, 10), 4) < today()
  ) {
    return null
  }
  return (
    <div
      role="status"
      className="flex flex-wrap items-center gap-3 rounded-2xl border border-primary/30 bg-primary/5 px-4 py-3"
    >
      <HugeiconsIcon
        icon={SparklesIcon}
        strokeWidth={2}
        className="size-5 shrink-0 text-primary"
      />
      <p className="min-w-0 flex-1 text-sm">
        <span className="font-medium">
          Nourvio planned {weekLabel(last.week)} for you:
        </span>{" "}
        {last.planned} {last.planned === 1 ? "meal" : "meals"}
        {last.listed ? `, and ${last.listed} things went on the list` : ""}.
      </p>
      <div className="flex gap-2">
        <Button size="sm" asChild>
          <Link to={`/plan?week=${last.week}`}>See the plan</Link>
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            try {
              localStorage.setItem(key, "1")
            } catch {
              // Not remembered; it shows again next time.
            }
            setSeen(true)
          }}
        >
          Got it
        </Button>
      </div>
    </div>
  )
}
