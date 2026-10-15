import { HugeiconsIcon } from "@hugeicons/react"
import { Clock01Icon } from "@hugeicons/core-free-icons"
import {
  costShown,
  type OnSale,
  type RecipeCost,
  type RecipeSummary,
} from "@mise/shared"
import { Link } from "react-router"

import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { onSaleText } from "@/features/shop/sale-text"
import { storedChoice } from "@/lib/stored-choice"

import { formatMinutes, formatRelativeDate } from "./format"
import { RatingStars } from "./rating-stars"
import { RecipeImage } from "./recipe-image"

export type RecipeView = "grid" | "list"

/** Photo cards or a compact list, remembered on this device. */
export const useRecipeView = storedChoice<RecipeView>(
  "mise.recipeView",
  ["grid", "list"],
  "grid"
)

/** "~$3.02 a serving", once most of the recipe is priced. */
function servingCost(cost: RecipeCost | undefined) {
  const shown = costShown(cost)
  return shown?.perServing
    ? `~${shown.perServing.toLocaleString(undefined, { style: "currency", currency: "USD" })}`
    : null
}

export function RecipeCard({
  recipe,
  onSale,
  cost,
}: {
  recipe: RecipeSummary
  /** What it uses that's on sale at the household's Fry's. */
  onSale?: OnSale[]
  cost?: RecipeCost
}) {
  const time = formatMinutes(recipe.totalMinutes)
  const perServing = servingCost(cost)

  return (
    <Link
      to={`/recipes/${recipe.slug}`}
      className="group rounded-3xl outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
    >
      <Card className="h-full gap-0 overflow-hidden py-0 transition-shadow group-hover:shadow-md">
        <RecipeImage
          src={recipe.thumbnailUrl}
          alt={recipe.name}
          className="aspect-[4/3] w-full"
        />
        <div className="flex flex-1 flex-col gap-2 p-3 sm:p-4">
          <h3 className="font-heading text-base leading-snug font-semibold sm:text-lg">
            {recipe.name}
          </h3>
          {(time || recipe.rating || perServing) && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
              {time && (
                <span className="flex items-center gap-1">
                  <HugeiconsIcon
                    icon={Clock01Icon}
                    strokeWidth={2}
                    className="size-4"
                  />
                  {time}
                </span>
              )}
              <RatingStars value={recipe.rating} />
              {perServing && (
                <span title="About this much a serving, at your store's prices">
                  {perServing}/serving
                </span>
              )}
            </div>
          )}
          {onSale?.length ? (
            <p className="line-clamp-2 text-sm font-medium text-primary">
              {onSaleText(onSale)}
            </p>
          ) : null}
          {(recipe.lastMadeAt || recipe.tags.length > 0) && (
            <div className="mt-auto flex flex-wrap gap-1.5 pt-1">
              {recipe.lastMadeAt && (
                <Badge className="bg-accent text-accent-foreground">
                  Made {formatRelativeDate(recipe.lastMadeAt)}
                </Badge>
              )}
              {recipe.tags.slice(0, recipe.lastMadeAt ? 2 : 3).map((tag) => (
                <Badge key={tag} variant="secondary" className="max-sm:hidden">
                  {tag}
                </Badge>
              ))}
              {recipe.tags.length > (recipe.lastMadeAt ? 2 : 3) && (
                <Badge variant="outline" className="max-sm:hidden">
                  +{recipe.tags.length - (recipe.lastMadeAt ? 2 : 3)}
                </Badge>
              )}
            </div>
          )}
        </div>
      </Card>
    </Link>
  )
}

/** A compact row, for scanning a big library. */
export function RecipeRow({
  recipe,
  onSale,
  cost,
}: {
  recipe: RecipeSummary
  onSale?: OnSale[]
  cost?: RecipeCost
}) {
  const time = formatMinutes(recipe.totalMinutes)
  const perServing = servingCost(cost)
  return (
    <Link
      to={`/recipes/${recipe.slug}`}
      className="flex items-center gap-3 rounded-2xl p-2 outline-none hover:bg-secondary/60 focus-visible:ring-[3px] focus-visible:ring-ring/50"
    >
      <RecipeImage
        src={recipe.thumbnailUrl}
        alt=""
        className="size-14 shrink-0 rounded-xl [&_svg]:size-6"
      />
      <div className="grid min-w-0 flex-1 gap-0.5">
        <p className="truncate font-medium">{recipe.name}</p>
        {onSale?.length ? (
          <p className="truncate text-sm font-medium text-primary">
            {onSaleText(onSale)}
          </p>
        ) : null}
        <div className="flex min-w-0 items-center gap-3 text-sm text-muted-foreground">
          {time && (
            <span className="flex shrink-0 items-center gap-1">
              <HugeiconsIcon
                icon={Clock01Icon}
                strokeWidth={2}
                className="size-3.5"
              />
              {time}
            </span>
          )}
          <RatingStars value={recipe.rating} />
          {perServing && <span className="shrink-0">{perServing}/serving</span>}
          {recipe.lastMadeAt && (
            <span className="shrink-0 font-medium text-primary">
              Made {formatRelativeDate(recipe.lastMadeAt)}
            </span>
          )}
          {recipe.tags.length > 0 && (
            <span className="truncate">{recipe.tags.join(", ")}</span>
          )}
        </div>
      </div>
    </Link>
  )
}
