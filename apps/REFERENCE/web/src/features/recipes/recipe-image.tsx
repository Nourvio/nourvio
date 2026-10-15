import { HugeiconsIcon } from "@hugeicons/react"
import { CookingPotIcon } from "@hugeicons/core-free-icons"

import { cn } from "@/lib/utils"

/** The recipe's photo, or a quiet placeholder when there isn't one. */
export function RecipeImage({
  src,
  alt,
  className,
  eager = false,
}: {
  src: string | null
  alt: string
  className?: string
  eager?: boolean
}) {
  if (src) {
    return (
      <img
        src={src}
        alt={alt}
        loading={eager ? "eager" : "lazy"}
        decoding="async"
        className={cn("bg-muted object-cover", className)}
      />
    )
  }
  return (
    <div
      role="img"
      aria-label={`${alt} (no photo yet)`}
      className={cn(
        "flex items-center justify-center bg-secondary text-muted-foreground/60",
        className
      )}
    >
      <HugeiconsIcon
        icon={CookingPotIcon}
        strokeWidth={1.5}
        className="size-10"
      />
    </div>
  )
}
