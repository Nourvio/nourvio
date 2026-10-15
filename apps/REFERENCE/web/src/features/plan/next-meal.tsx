import * as React from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  CookingPotIcon,
  MoreHorizontalIcon,
  RefreshIcon,
  Tick02Icon,
} from "@hugeicons/core-free-icons"
import {
  addDays,
  MEAL_NAMES,
  nextPlannedMeal,
  type Meal,
  type PlanEntry,
} from "@mise/shared"
import { Link } from "react-router"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { usePantry } from "@/features/pantry/use-pantry"
import { formatMinutes } from "@/features/recipes/format"
import { RecipeImage } from "@/features/recipes/recipe-image"
import { cn } from "@/lib/utils"

import { cookLink } from "./cook-link"
import { dayName, today } from "./dates"
import { useSetEntryStatus, useSwapEntry } from "./use-plan"

/** The time now, updated every minute, so what's next moves on by itself. */
export function useMinute() {
  const [now, setNow] = React.useState(() => new Date())
  React.useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(timer)
  }, [])
  return now
}

/** The next meal to cook from these, as of now (see nextPlannedMeal). */
export function findNextMeal(entries: PlanEntry[], now: Date) {
  return nextPlannedMeal(entries, today(), now.getHours())
}

const PART_OF_DAY: Record<Meal, string> = {
  breakfast: "morning",
  lunch: "afternoon",
  dinner: "night",
  snack: "snack",
}

/** "This morning", "This afternoon", "Tonight", "Tomorrow night", "Friday afternoon". */
export function whenLabel(entry: Pick<PlanEntry, "date" | "meal">) {
  const now = today()
  if (entry.date === now) {
    return entry.meal === "breakfast"
      ? "This morning"
      : entry.meal === "lunch"
        ? "This afternoon"
        : "Tonight"
  }
  const day = entry.date === addDays(now, 1) ? "Tomorrow" : dayName(entry.date)
  return `${day} ${PART_OF_DAY[entry.meal]}`
}

/** A big card's frame: a photo on one side, the words on the other. */
export function HeroFrame({
  labelledBy,
  large = false,
  photo,
  children,
}: {
  labelledBy: string
  /** Today's size: a bigger photo and more room. */
  large?: boolean
  photo: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <article
      aria-labelledby={labelledBy}
      className="overflow-hidden rounded-3xl border bg-card text-card-foreground sm:flex"
    >
      {photo && (
        <div
          className={cn(
            "relative shrink-0 overflow-hidden bg-muted",
            large ? "sm:min-h-96 sm:w-[45%]" : "sm:min-h-56 sm:w-72"
          )}
        >
          {photo}
        </div>
      )}
      <div
        className={cn(
          "grid min-w-0 flex-1 content-center gap-4 p-5",
          large ? "md:p-8" : "md:p-7"
        )}
      >
        {children}
      </div>
    </article>
  )
}

/** Fills a HeroFrame's photo side. */
export const HERO_PHOTO =
  "aspect-[16/10] w-full sm:absolute sm:inset-0 sm:aspect-auto sm:h-full"

/** "Tonight · Dinner", solid, so what's next stands out. */
export function WhenBadge({
  children,
  large = false,
}: {
  children: React.ReactNode
  large?: boolean
}) {
  return (
    <p
      className={cn(
        "justify-self-start rounded-full bg-primary font-bold tracking-wider text-primary-foreground uppercase",
        large ? "px-4 py-1.5 text-sm" : "px-3 py-1 text-xs"
      )}
    >
      {children}
    </p>
  )
}

/** A little fact about a meal: "4 servings", "On the list". */
export function Fact({
  children,
  good = false,
}: {
  children: React.ReactNode
  good?: boolean
}) {
  return (
    <span
      className={cn(
        "rounded-full px-3 py-1 text-sm font-medium",
        good ? "bg-accent text-accent-foreground" : "bg-secondary"
      )}
    >
      {children}
    </span>
  )
}

/** The rest of today's meals, as a line under the big card. */
export function TodayLine({
  label,
  entries,
}: {
  label: string
  entries: PlanEntry[]
}) {
  if (!entries.length) return null
  return (
    <p className="border-t pt-3 text-sm text-muted-foreground">
      {label} ·{" "}
      {entries.map((entry, i) => (
        <React.Fragment key={entry.id}>
          {i > 0 && ", "}
          {MEAL_NAMES[entry.meal]}: {entry.recipe?.name ?? entry.note}
          {entry.status === "cooked" && (
            <span className="font-medium text-primary"> (done)</span>
          )}
          {entry.status === "skipped" && " (skipped)"}
        </React.Fragment>
      ))}
    </p>
  )
}

/** The next meal, big, with a way straight into cooking it. */
export function NextMealCard({
  entry,
  onEdit,
  headingLevel = 2,
  large = false,
  others = [],
  othersLabel = "Also today",
}: {
  entry: PlanEntry
  /** Opens moving it or changing its servings, where the page has that. */
  onEdit?: () => void
  headingLevel?: 2 | 3
  large?: boolean
  /** Other meals today, listed underneath. */
  others?: PlanEntry[]
  othersLabel?: string
}) {
  const { setStatus, isPending } = useSetEntryStatus()
  const { swap, isPending: swapping } = useSwapEntry()
  const pantry = usePantry()
  const { recipe } = entry
  const id = React.useId()
  const Heading = headingLevel === 2 ? "h2" : "h3"
  const servings = entry.servings ?? recipe?.servings ?? null
  const time = formatMinutes(recipe?.totalMinutes)
  // What was bought for it and put away.
  const atHome = (pantry.data ?? [])
    .filter((item) => item.meals.some((meal) => meal.id === entry.id))
    .map((item) => item.name.toLowerCase())
  const href = recipe
    ? `/recipes/${recipe.slug}${entry.with ? `?with=${entry.with.slug}` : ""}`
    : null

  return (
    <HeroFrame
      labelledBy={id}
      large={large}
      photo={
        href &&
        recipe?.thumbnailUrl && (
          <Link to={href} tabIndex={-1} className="block h-full">
            <RecipeImage
              src={recipe.thumbnailUrl}
              alt=""
              eager
              className={HERO_PHOTO}
            />
          </Link>
        )
      }
    >
      <div className={cn("grid", large ? "gap-3" : "gap-2")}>
        <WhenBadge large={large}>
          {whenLabel(entry)} · {MEAL_NAMES[entry.meal]}
        </WhenBadge>
        <Heading
          id={id}
          className={cn(
            "font-heading leading-tight font-semibold",
            large
              ? "text-3xl tracking-tight md:text-[2.6rem]"
              : "text-2xl md:text-3xl"
          )}
        >
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
        </Heading>
        {(servings || time || entry.listed) && (
          <div className="flex flex-wrap gap-1.5">
            {servings && <Fact>{servings} servings</Fact>}
            {time && <Fact>{time}</Fact>}
            {entry.listed && <Fact good>On the list</Fact>}
          </div>
        )}
        {atHome.length > 0 && (
          <p className="text-sm text-muted-foreground">
            Already home:{" "}
            {atHome.length > 1
              ? `${atHome.slice(0, -1).join(", ")} and ${atHome.at(-1)}`
              : atHome[0]}
            .
          </p>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        {recipe && (
          <Button size="lg" className={cn(large && "h-12 px-6")} asChild>
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
          className={cn(large && "h-12 px-5")}
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
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              size="icon-lg"
              variant="outline"
              className={cn(large && "size-12")}
              aria-label={`More for ${recipe?.name ?? entry.note}`}
            >
              <HugeiconsIcon icon={MoreHorizontalIcon} strokeWidth={2} />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            {recipe && (
              <DropdownMenuItem
                disabled={swapping}
                onSelect={() => swap(entry)}
              >
                <HugeiconsIcon icon={RefreshIcon} strokeWidth={2} />
                Something else
              </DropdownMenuItem>
            )}
            <DropdownMenuItem
              onSelect={() => setStatus(entry, "skipped", "Skipped")}
            >
              Skip
            </DropdownMenuItem>
            {onEdit && (
              <DropdownMenuItem onSelect={onEdit}>
                Move or change servings
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <TodayLine label={othersLabel} entries={others} />
    </HeroFrame>
  )
}
