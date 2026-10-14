import { HugeiconsIcon } from "@hugeicons/react"
import {
  Clock01Icon,
  CookingPotIcon,
  Tick02Icon,
} from "@hugeicons/core-free-icons"
import type { FoundRecipe } from "@mise/shared"
import { Link } from "react-router"

import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { formatMinutes } from "@/features/recipes/format"
import { cn } from "@/lib/utils"

/** A recipe out on the web: photo, name, site and time, with Import (or a link once it's in). */
export function FoundRecipeCard({
  recipe,
  importing,
  onImport,
  detail,
}: {
  recipe: FoundRecipe
  importing: boolean
  onImport: () => void
  /** A line under the name, like why it was picked. */
  detail?: string
}) {
  const time = formatMinutes(recipe.minutes)
  return (
    <article className="flex flex-col overflow-hidden rounded-3xl border bg-card text-card-foreground">
      <a
        href={recipe.url}
        target="_blank"
        rel="noreferrer"
        tabIndex={-1}
        className="block"
      >
        {recipe.imageUrl ? (
          <img
            src={recipe.imageUrl}
            alt=""
            loading="lazy"
            decoding="async"
            className="aspect-[4/3] w-full bg-muted object-cover"
          />
        ) : (
          <div className="flex aspect-[4/3] w-full items-center justify-center bg-secondary text-muted-foreground/60">
            <HugeiconsIcon
              icon={CookingPotIcon}
              strokeWidth={1.5}
              className="size-10"
            />
          </div>
        )}
      </a>
      <div className="flex flex-1 flex-col gap-2 p-4">
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          {recipe.site}
        </p>
        <a
          href={recipe.url}
          target="_blank"
          rel="noreferrer"
          className="font-heading text-lg leading-snug font-semibold hover:underline"
        >
          {recipe.title}
        </a>
        {detail && <p className="text-sm text-muted-foreground">{detail}</p>}
        {time && (
          <p className="flex items-center gap-1 text-sm text-muted-foreground">
            <HugeiconsIcon
              icon={Clock01Icon}
              strokeWidth={2}
              className="size-4"
            />
            {time}
          </p>
        )}
        <div className="mt-auto pt-2">
          {recipe.inLibrary ? (
            <Button variant="ghost" size="sm" asChild className="-ml-2">
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
              size="sm"
              variant="outline"
              disabled={importing}
              onClick={onImport}
              className={cn(importing && "cursor-wait")}
            >
              {importing && <Spinner data-icon="inline-start" />}
              {importing ? "Importing…" : "Import"}
            </Button>
          )}
        </div>
      </div>
    </article>
  )
}
