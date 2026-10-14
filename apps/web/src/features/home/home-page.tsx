import * as React from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  CookBookIcon,
  CookingPotIcon,
  Note01Icon,
  RefreshIcon,
  SparklesIcon,
  Tick02Icon,
} from "@hugeicons/core-free-icons"
import {
  addDays,
  DEFAULT_MEALS,
  MEAL_NAMES,
  MEALS,
  toIsoDate,
  whyUseSoon,
  type MealSuggestion,
  type PlanEntry,
  type RecipeSummary,
} from "@mise/shared"
import { Link } from "react-router"
import { toast } from "sonner"

import { Panel, SectionHeading } from "@/components/layout/page-layout"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { useCurrentUser } from "@/features/auth/current-user"
import { useList } from "@/features/list/use-list"
import { soonLabel, urgency } from "@/features/pantry/soon"
import { usePantry } from "@/features/pantry/use-pantry"
import { cookLink } from "@/features/plan/cook-link"
import {
  friendlyDay,
  fromIsoDate,
  today,
  weekLabel,
} from "@/features/plan/dates"
import {
  useAddPlanEntry,
  usePlan,
  useSetEntryStatus,
  useSuggestMeal,
} from "@/features/plan/use-plan"
import { formatMinutes, formatRelativeDate } from "@/features/recipes/format"
import { RecipeImage } from "@/features/recipes/recipe-image"
import { useRecipes } from "@/features/recipes/use-recipes"
import { useHouseholdInfo } from "@/features/settings/use-household"
import { ApiError } from "@/lib/api"
import { cn } from "@/lib/utils"

const LONG_DATE = new Intl.DateTimeFormat(undefined, {
  weekday: "long",
  month: "long",
  day: "numeric",
})

/**
 * Today at a glance: what's cooking next (or an idea when nothing is), the
 * days ahead, food to use soon, the shopping list, and recipes worth making
 * again.
 */
export function HomePage() {
  const me = useCurrentUser()
  const now = today()
  const plan = usePlan(now, addDays(now, 6))
  const recipes = useRecipes()
  const household = useHouseholdInfo()
  const meals = household.data?.meals ?? DEFAULT_MEALS
  const hour = new Date().getHours()
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
  // The meal of the day it is now: breakfast, then lunch, then dinner.
  const nowMeal = hour < 11 ? 0 : hour < 15 ? 1 : 2
  const upNext = todays.find(
    (entry) =>
      entry.status === "planned" &&
      entry.meal !== "snack" &&
      MEALS.indexOf(entry.meal) >= nowMeal
  )
  const wantIdea =
    plan.isSuccess &&
    !upNext &&
    meals.includes("dinner") &&
    !todays.some((entry) => entry.meal === "dinner") &&
    hour < 21
  const alsoToday = todays.filter((entry) => entry !== upNext)
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
          <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
            <div className="grid content-start gap-8">
              <section aria-labelledby="today-heading" className="grid gap-3">
                <h2 id="today-heading" className="sr-only">
                  Today
                </h2>
                {plan.isPending ? (
                  <Skeleton className="h-56 rounded-3xl" />
                ) : upNext ? (
                  <UpNext entry={upNext} />
                ) : wantIdea ? (
                  <DinnerIdea date={now} />
                ) : todays.length === 0 ? (
                  <NothingToday />
                ) : null}
                {alsoToday.length > 0 && (
                  <div className="grid gap-1">
                    <p className="text-sm font-medium text-muted-foreground">
                      {upNext || wantIdea ? "Also today" : "Today"}
                    </p>
                    <ul className="grid gap-1">
                      {alsoToday.map((entry) => (
                        <MealRow key={entry.id} entry={entry} />
                      ))}
                    </ul>
                  </div>
                )}
              </section>

              <ComingUp
                entries={entries.filter((entry) => entry.date > now)}
                loading={plan.isPending}
              />
            </div>

            <aside className="grid content-start gap-4">
              <UseSoon />
              <ListCard />
            </aside>
          </div>

          <Shelves recipes={recipes.data} />
        </>
      )}
    </div>
  )
}

/** The next meal to cook today, big, with a way straight into cooking it. */
function UpNext({ entry }: { entry: PlanEntry }) {
  const { setStatus, isPending } = useSetEntryStatus()
  const { recipe } = entry
  const servings = entry.servings ?? recipe?.servings ?? null
  const details = [
    servings && `${servings} servings`,
    formatMinutes(recipe?.totalMinutes),
    entry.listed && "On the list",
  ].filter(Boolean)
  const href = recipe
    ? `/recipes/${recipe.slug}${entry.with ? `?with=${entry.with.slug}` : ""}`
    : null

  return (
    <article className="overflow-hidden rounded-3xl border bg-card text-card-foreground sm:flex">
      {recipe && href && <HeroPhoto to={href} src={recipe.thumbnailUrl} />}
      <div className="grid min-w-0 flex-1 content-center gap-4 p-5 md:p-6">
        <div className="grid gap-1.5">
          <p className="text-xs font-semibold tracking-wide text-primary uppercase">
            {entry.meal === "dinner"
              ? "Tonight"
              : `${MEAL_NAMES[entry.meal]} today`}
          </p>
          <h3 className="font-heading text-2xl leading-tight font-semibold md:text-3xl">
            {href ? (
              <Link to={href} className="hover:underline">
                {recipe!.name}
              </Link>
            ) : (
              entry.note
            )}
            {entry.with && (
              <span className="font-normal text-muted-foreground">
                {" "}
                with {entry.with.name}
              </span>
            )}
          </h3>
          {details.length > 0 && (
            <p className="text-sm text-muted-foreground">
              {details.join(" · ")}
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {recipe && (
            <Button size="lg" asChild>
              <Link to={cookLink(entry)}>
                <HugeiconsIcon
                  icon={CookingPotIcon}
                  strokeWidth={2}
                  data-icon="inline-start"
                />
                Start cooking
              </Link>
            </Button>
          )}
          <Button
            size="lg"
            variant="outline"
            disabled={isPending}
            onClick={() =>
              setStatus(entry, "cooked", recipe ? "Marked as cooked" : "Done")
            }
          >
            <HugeiconsIcon
              icon={Tick02Icon}
              strokeWidth={2}
              data-icon="inline-start"
            />
            {recipe ? "Mark cooked" : "Done"}
          </Button>
        </div>
      </div>
    </article>
  )
}

/** The big photo beside a featured meal, when it has one. */
function HeroPhoto({ to, src }: { to: string; src: string | null }) {
  if (!src) return null
  return (
    <Link to={to} tabIndex={-1} className="block shrink-0 sm:w-72">
      <RecipeImage
        src={src}
        alt=""
        eager
        className="aspect-[16/10] h-full w-full sm:aspect-auto sm:min-h-56"
      />
    </Link>
  )
}

/** Nothing for dinner yet: one idea at a time, planned with a tap. */
function DinnerIdea({ date }: { date: string }) {
  const suggest = useSuggestMeal()
  const add = useAddPlanEntry()
  const [idea, setIdea] = React.useState<MealSuggestion | null>(null)
  const [seen, setSeen] = React.useState<string[]>([])
  const [noMore, setNoMore] = React.useState(false)

  function next() {
    suggest.mutate(
      { slots: [{ date, meal: "dinner" }], exclude: seen.slice(-100) },
      {
        onSuccess: ([suggestion]) => {
          if (!suggestion) {
            if (idea) toast("That's the only idea for now")
            else setNoMore(true)
            return
          }
          setIdea(suggestion)
          setSeen((current) => [...current, suggestion.recipe.id])
        },
        onError: () => toast.error("Couldn't come up with an idea"),
      }
    )
  }

  function plan() {
    if (!idea) return
    add.mutate(
      {
        date,
        meal: "dinner",
        recipeId: idea.recipe.id,
        withRecipeId: idea.with?.id ?? null,
      },
      {
        onSuccess: () => toast.success(`${idea.recipe.name} is on for tonight`),
        onError: (error) =>
          toast.error(
            error instanceof ApiError ? error.message : "Couldn't plan that"
          ),
      }
    )
  }

  if (!idea) {
    return (
      <article className="grid gap-4 rounded-3xl border border-dashed bg-card p-6 text-card-foreground">
        <div className="grid gap-1">
          <h3 className="font-heading text-2xl font-semibold">
            What's for dinner?
          </h3>
          <p className="text-muted-foreground">
            {noMore
              ? "No ideas right now. Add a few more recipes for more variety."
              : "Nothing's planned for tonight. Get an idea from your recipes, using up what needs using first."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {!noMore && (
            <Button size="lg" onClick={next} disabled={suggest.isPending}>
              <HugeiconsIcon
                icon={SparklesIcon}
                strokeWidth={2}
                data-icon="inline-start"
              />
              Get an idea
            </Button>
          )}
          <Button size="lg" variant="outline" asChild>
            <Link to="/plan">Open the plan</Link>
          </Button>
        </div>
      </article>
    )
  }

  const { recipe } = idea
  return (
    <article className="overflow-hidden rounded-3xl border bg-card text-card-foreground sm:flex">
      <HeroPhoto
        to={`/recipes/${recipe.slug}${idea.with ? `?with=${idea.with.slug}` : ""}`}
        src={recipe.thumbnailUrl}
      />
      <div className="grid min-w-0 flex-1 content-center gap-4 p-5 md:p-6">
        <div className="grid gap-1.5">
          <p className="text-xs font-semibold tracking-wide text-primary uppercase">
            An idea for tonight
          </p>
          <h3 className="font-heading text-2xl leading-tight font-semibold md:text-3xl">
            <Link
              to={`/recipes/${recipe.slug}${idea.with ? `?with=${idea.with.slug}` : ""}`}
              className="hover:underline"
            >
              {recipe.name}
            </Link>
            {idea.with && (
              <span className="font-normal text-muted-foreground">
                {" "}
                with {idea.with.name}
              </span>
            )}
          </h3>
          <p className="text-sm text-muted-foreground">
            {[
              formatMinutes(recipe.totalMinutes),
              idea.uses.length > 0 && `Uses up your ${idea.uses.join(", ")}`,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="lg" onClick={plan} disabled={add.isPending}>
            Plan it for tonight
          </Button>
          <Button
            size="lg"
            variant="outline"
            onClick={next}
            disabled={suggest.isPending}
          >
            <HugeiconsIcon
              icon={RefreshIcon}
              strokeWidth={2}
              data-icon="inline-start"
            />
            Another idea
          </Button>
        </div>
      </div>
    </article>
  )
}

function NothingToday() {
  return (
    <article className="grid gap-3 rounded-3xl border border-dashed bg-card p-6 text-card-foreground">
      <h3 className="font-heading text-xl font-semibold">
        Nothing planned today
      </h3>
      <div>
        <Button variant="outline" asChild>
          <Link to="/plan">Open the plan</Link>
        </Button>
      </div>
    </article>
  )
}

/** A planned meal in a list: photo, name, and what's happening with it. */
function MealRow({
  entry,
  showMeal = true,
}: {
  entry: PlanEntry
  showMeal?: boolean
}) {
  const { recipe } = entry
  const skipped = entry.status === "skipped"
  const cooked = entry.status === "cooked"
  return (
    <li className="flex items-center gap-3 rounded-2xl p-1.5 hover:bg-secondary/50">
      {recipe ? (
        <RecipeImage
          src={recipe.thumbnailUrl}
          alt=""
          className={cn(
            "size-12 shrink-0 rounded-xl [&_svg]:size-5",
            skipped && "opacity-50"
          )}
        />
      ) : (
        <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground">
          <HugeiconsIcon icon={Note01Icon} strokeWidth={2} className="size-5" />
        </span>
      )}
      <div className="grid min-w-0 flex-1 gap-0.5">
        {recipe ? (
          <Link
            to={`/recipes/${recipe.slug}${entry.with ? `?with=${entry.with.slug}` : ""}`}
            className={cn(
              "truncate font-medium hover:underline",
              skipped && "text-muted-foreground line-through"
            )}
          >
            {recipe.name}
            {entry.with && (
              <span className="font-normal text-muted-foreground">
                {" "}
                with {entry.with.name}
              </span>
            )}
          </Link>
        ) : (
          <span
            className={cn(
              "truncate font-medium",
              skipped && "text-muted-foreground line-through"
            )}
          >
            {entry.note}
          </span>
        )}
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          {showMeal && MEAL_NAMES[entry.meal]}
          {cooked && (
            <span className="flex items-center gap-1 font-medium text-primary">
              {showMeal && "·"}
              <HugeiconsIcon
                icon={Tick02Icon}
                strokeWidth={2}
                className="size-3.5"
              />
              Cooked
            </span>
          )}
          {skipped && <span>{showMeal && "· "}Skipped</span>}
        </span>
      </div>
      {recipe && entry.status === "planned" && (
        <Button
          variant="ghost"
          size="icon-sm"
          asChild
          aria-label={`Start cooking ${recipe.name}`}
          title="Start cooking"
        >
          <Link to={cookLink(entry)}>
            <HugeiconsIcon icon={CookingPotIcon} strokeWidth={2} />
          </Link>
        </Button>
      )}
    </li>
  )
}

/** The next few days with something planned. */
function ComingUp({
  entries,
  loading,
}: {
  entries: PlanEntry[]
  loading: boolean
}) {
  const days = [...new Set(entries.map((entry) => entry.date))].slice(0, 3)
  return (
    <section aria-labelledby="coming-up-heading" className="grid gap-3">
      <SectionHeading id="coming-up-heading" to="/plan" link="See the week">
        Coming up
      </SectionHeading>
      {loading ? (
        <Skeleton className="h-32 rounded-2xl" />
      ) : days.length === 0 ? (
        <p className="rounded-2xl border border-dashed p-4 text-sm text-muted-foreground">
          Nothing planned for the next few days.{" "}
          <Link to="/plan" className="font-medium text-primary hover:underline">
            Plan the week
          </Link>
        </p>
      ) : (
        <div className="grid gap-4">
          {days.map((date) => (
            <div key={date} className="grid gap-1">
              <p className="text-sm font-medium text-muted-foreground">
                {friendlyDay(date)}
              </p>
              <ul className="grid gap-1">
                {entries
                  .filter((entry) => entry.date === date)
                  .map((entry) => (
                    <MealRow key={entry.id} entry={entry} />
                  ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

/** Pantry food that needs using, most urgent first. */
function UseSoon() {
  const pantry = usePantry()
  const now = today()
  const soon = (pantry.data ?? [])
    .map((item) => ({ item, soon: whyUseSoon(item, now) }))
    .filter((row) => row.soon)
    .sort((a, b) => urgency(a.soon!) - urgency(b.soon!))
  if (!soon.length) return null
  return (
    <Panel title="Use soon" to="/pantry" link="Pantry" tone="warn">
      <ul className="grid gap-2.5">
        {soon.slice(0, 5).map(({ item, soon }) => (
          <li key={item.id} className="flex items-start gap-3">
            <div className="grid min-w-0 flex-1 gap-0.5">
              <span className="truncate font-medium first-letter:uppercase">
                {item.name}
              </span>
              <span
                className={cn(
                  "text-xs",
                  soon!.kind === "past"
                    ? "text-destructive"
                    : "text-muted-foreground"
                )}
              >
                {soonLabel(soon!)}
              </span>
            </div>
            <Link
              to={`/recipes?q=${encodeURIComponent(item.name)}`}
              className="shrink-0 pt-0.5 text-xs font-medium text-primary hover:underline"
            >
              Recipes
            </Link>
          </li>
        ))}
      </ul>
      {soon.length > 5 && (
        <p className="text-xs text-muted-foreground">
          And {soon.length - 5} more in the pantry.
        </p>
      )}
    </Panel>
  )
}

/** How much shopping is left. */
function ListCard() {
  const list = useList()
  const left = (list.data ?? []).filter((item) => !item.checked)
  return (
    <Panel title="Shopping list" to="/list" link="Open">
      {list.isPending ? (
        <Skeleton className="h-12" />
      ) : left.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nothing left to buy.{" "}
          <Link to="/list" className="font-medium text-primary hover:underline">
            Add the week's meals
          </Link>
        </p>
      ) : (
        <div className="grid gap-1">
          <p className="font-heading text-2xl font-semibold">
            {left.length} {left.length === 1 ? "thing" : "things"} to buy
          </p>
          <p className="line-clamp-2 text-sm text-muted-foreground first-letter:uppercase">
            {left
              .slice(0, 6)
              .map((item) => item.name)
              .join(", ")}
            {left.length > 6 ? ", …" : ""}
          </p>
        </div>
      )}
    </Panel>
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
      text: "Paste a link from any recipe site or video, or snap a cookbook page.",
    },
    {
      title: "Plan the week",
      text: "Pick meals for each day, or let Mise fill the week from your recipes.",
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
            Welcome to Mise
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

/** The week Mise planned by itself, to look over: shown for a few days after. */
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
          Mise planned {weekLabel(last.week)} for you:
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
