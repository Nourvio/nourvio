import { HugeiconsIcon } from "@hugeicons/react"
import { MinusSignIcon, PlusSignIcon } from "@hugeicons/core-free-icons"
import { formatQuantity } from "@mise/shared"

import { Button } from "@/components/ui/button"

/**
 * Changes how much to make. With a known serving count it steps servings;
 * without one it steps a multiplier (½×, 1×, 2×...).
 */
export function ServingsStepper({
  baseServings,
  factor,
  onChange,
}: {
  baseServings: number | null
  factor: number
  onChange: (factor: number) => void
}) {
  if (baseServings) {
    const servings = Math.round(baseServings * factor * 100) / 100
    const step = (delta: number) => {
      const next = Math.max(1, Math.round(servings) + delta)
      onChange(next / baseServings)
    }
    return (
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="icon-sm"
          aria-label="Fewer servings"
          onClick={() => step(-1)}
          disabled={servings <= 1}
        >
          <HugeiconsIcon icon={MinusSignIcon} strokeWidth={2} />
        </Button>
        <span
          className="min-w-20 text-center text-sm font-medium"
          aria-live="polite"
        >
          {formatQuantity(servings)} serving{servings === 1 ? "" : "s"}
        </span>
        <Button
          variant="outline"
          size="icon-sm"
          aria-label="More servings"
          onClick={() => step(1)}
        >
          <HugeiconsIcon icon={PlusSignIcon} strokeWidth={2} />
        </Button>
      </div>
    )
  }

  const steps = [0.5, 1, 1.5, 2, 3, 4]
  const index = Math.max(0, steps.indexOf(factor))
  return (
    <div className="flex items-center gap-2">
      <Button
        variant="outline"
        size="icon-sm"
        aria-label="Make less"
        onClick={() => onChange(steps[Math.max(0, index - 1)]!)}
        disabled={index === 0}
      >
        <HugeiconsIcon icon={MinusSignIcon} strokeWidth={2} />
      </Button>
      <span
        className="min-w-14 text-center text-sm font-medium"
        aria-live="polite"
      >
        {formatQuantity(factor)}×
      </span>
      <Button
        variant="outline"
        size="icon-sm"
        aria-label="Make more"
        onClick={() => onChange(steps[Math.min(steps.length - 1, index + 1)]!)}
        disabled={index === steps.length - 1}
      >
        <HugeiconsIcon icon={PlusSignIcon} strokeWidth={2} />
      </Button>
    </div>
  )
}
