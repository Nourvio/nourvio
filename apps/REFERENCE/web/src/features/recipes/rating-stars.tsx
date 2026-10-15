import { HugeiconsIcon } from "@hugeicons/react"
import { StarIcon } from "@hugeicons/core-free-icons"

import { cn } from "@/lib/utils"

const STARS = [1, 2, 3, 4, 5]

/** Read-only stars, or tappable ones when `onChange` is given (tap the same star to clear). */
export function RatingStars({
  value,
  onChange,
  size = "sm",
}: {
  value: number | null
  onChange?: (rating: number | null) => void
  size?: "sm" | "md"
}) {
  const icon = size === "md" ? "size-6" : "size-4"

  if (!onChange) {
    if (!value) return null
    return (
      <span
        role="img"
        aria-label={`Rated ${value} out of 5`}
        className="flex text-highlight"
      >
        {STARS.map((star) => (
          <HugeiconsIcon
            key={star}
            icon={StarIcon}
            strokeWidth={2}
            className={cn(icon, star <= value ? "fill-current" : "opacity-30")}
          />
        ))}
      </span>
    )
  }

  return (
    <div role="radiogroup" aria-label="Rating" className="flex">
      {STARS.map((star) => {
        const filled = value !== null && star <= value
        return (
          <button
            key={star}
            type="button"
            role="radio"
            aria-checked={value === star}
            aria-label={`${star} star${star === 1 ? "" : "s"}`}
            onClick={() => onChange(value === star ? null : star)}
            className="rounded-full p-1 text-highlight transition-transform outline-none hover:scale-110 focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            <HugeiconsIcon
              icon={StarIcon}
              strokeWidth={2}
              className={cn(icon, filled ? "fill-current" : "opacity-40")}
            />
          </button>
        )
      })}
    </div>
  )
}
