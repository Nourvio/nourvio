import { Clock01Icon, UserGroupIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { Link } from "@tanstack/react-router"
import { useTranslation } from "react-i18next"

import { Badge } from "@/components/ui/badge"

import { formatMinutes, formatServings } from "./format"
import type { RecipeSummary } from "./queries"
import { RatingStars } from "./rating-stars"

/** A recipe in the library: its name, a little about it, and its tags. */
export function RecipeCard({ recipe }: { recipe: RecipeSummary }) {
  const { t } = useTranslation()
  return (
    <Link
      to="/recipes/$slug"
      params={{ slug: recipe.slug }}
      className="group flex h-full flex-col gap-3 rounded-3xl border bg-card p-5 text-card-foreground transition-colors outline-none hover:border-primary/40 hover:bg-muted/40 focus-visible:ring-[3px] focus-visible:ring-ring/50"
    >
      <div className="space-y-1.5">
        <h2 className="font-heading text-lg leading-snug font-semibold group-hover:text-primary">
          {recipe.name}
        </h2>
        {recipe.description && (
          <p className="line-clamp-2 text-sm text-muted-foreground">
            {recipe.description}
          </p>
        )}
      </div>
      <div className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
        {recipe.totalMinutes !== null && (
          <span className="inline-flex items-center gap-1.5">
            <HugeiconsIcon
              icon={Clock01Icon}
              strokeWidth={2}
              className="size-4"
            />
            {formatMinutes(t, recipe.totalMinutes)}
          </span>
        )}
        {recipe.servings !== null && (
          <span className="inline-flex items-center gap-1.5">
            <HugeiconsIcon
              icon={UserGroupIcon}
              strokeWidth={2}
              className="size-4"
            />
            {t("recipes.serves", {
              count: recipe.servings,
              servings: formatServings(recipe.servings),
            })}
          </span>
        )}
        {recipe.rating !== null && <RatingStars rating={recipe.rating} />}
      </div>
      {recipe.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {recipe.tags.map((tag) => (
            <Badge key={tag} variant="secondary">
              {tag}
            </Badge>
          ))}
        </div>
      )}
    </Link>
  )
}
