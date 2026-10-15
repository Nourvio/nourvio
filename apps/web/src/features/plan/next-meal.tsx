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
import { formatMinutes } from "@/features/recipes/format"
import { RecipeImage } from "@/features/recipes/recipe-image"

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

/** The next meal, big, with a way straight into cooking it. */
export function NextMealCard({
  entry,
  onEdit,
  headingLevel = 2,
}: {
  entry: PlanEntry
  /** Opens moving it or changing its servings, where the page has that. */
  onEdit?: () => void
  headingLevel?: 2 | 3
}) {
  const { setStatus, isPending } = useSetEntryStatus()
  const { swap, isPending: swapping } = useSwapEntry()
  const { recipe } = entry
  const id = React.useId()
  const Heading = headingLevel === 2 ? "h2" : "h3"
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
    <article
      aria-labelledby={id}
      className="overflow-hidden rounded-3xl border bg-card text-card-foreground sm:flex"
    >
      {href && recipe?.thumbnailUrl && (
        <Link to={href} tabIndex={-1} className="block shrink-0 sm:w-72">
          <RecipeImage
            src={recipe.thumbnailUrl}
            alt=""
            eager
            className="aspect-[16/10] h-full w-full sm:aspect-auto sm:min-h-56"
          />
        </Link>
      )}
      <div className="grid min-w-0 flex-1 content-center gap-4 p-5 md:p-7">
        <div className="grid gap-1.5">
          <p className="text-xs font-semibold tracking-wide text-primary uppercase">
            {whenLabel(entry)}
          </p>
          <Heading
            id={id}
            className="font-heading text-2xl leading-tight font-semibold md:text-3xl"
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
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                size="icon-lg"
                variant="outline"
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
      </div>
    </article>
  )
}
