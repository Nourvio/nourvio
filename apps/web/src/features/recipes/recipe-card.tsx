import { HugeiconsIcon } from "@hugeicons/react"
import { Clock01Icon } from "@hugeicons/core-free-icons"
import type { RecipeSummary } from "@mise/shared"
import { Link } from "react-router"

import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { storedChoice } from "@/lib/stored-choice"

import { formatMinutes } from "./format"
import { RatingStars } from "./rating-stars"
import { RecipeImage } from "./recipe-image"

export type RecipeView = "grid" | "list"

/** Photo cards or a compact list, remembered on this device. */
export const useRecipeView = storedChoice<RecipeView>(
  "mise.recipeView",
  ["grid", "list"],
  "grid"
)

export function RecipeCard({ recipe }: { recipe: RecipeSummary }) {
  const time = formatMinutes(recipe.totalMinutes)

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
        <div className="flex flex-1 flex-col gap-2 p-4">
          <h3 className="font-heading text-lg leading-snug font-semibold">
            {recipe.name}
          </h3>
          {(time || recipe.rating) && (
            <div className="flex items-center gap-3 text-sm text-muted-foreground">
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
            </div>
          )}
          {recipe.tags.length > 0 && (
            <div className="mt-auto flex flex-wrap gap-1.5 pt-1">
              {recipe.tags.slice(0, 3).map((tag) => (
                <Badge key={tag} variant="secondary">
                  {tag}
                </Badge>
              ))}
              {recipe.tags.length > 3 && (
                <Badge variant="outline">+{recipe.tags.length - 3}</Badge>
              )}
            </div>
          )}
        </div>
      </Card>
    </Link>
  )
}

/** A compact row, for scanning a big library. */
export function RecipeRow({ recipe }: { recipe: RecipeSummary }) {
  const time = formatMinutes(recipe.totalMinutes)
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
          {recipe.tags.length > 0 && (
            <span className="truncate">{recipe.tags.join(", ")}</span>
          )}
        </div>
      </div>
    </Link>
  )
}
