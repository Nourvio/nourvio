import { HugeiconsIcon } from "@hugeicons/react"
import { Clock01Icon } from "@hugeicons/core-free-icons"
import type { RecipeSummary } from "@mise/shared"
import { Link } from "react-router"

import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"

import { formatMinutes } from "./format"
import { RatingStars } from "./rating-stars"
import { RecipeImage } from "./recipe-image"

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
