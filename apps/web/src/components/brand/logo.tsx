import { HugeiconsIcon } from "@hugeicons/react"
import { CookingPotIcon } from "@hugeicons/core-free-icons"

import { cn } from "@/lib/utils"

export function Logo({
  className,
  showWordmark = true,
}: {
  className?: string
  showWordmark?: boolean
}) {
  return (
    <span className={cn("flex items-center gap-2", className)}>
      <span className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
        <HugeiconsIcon
          icon={CookingPotIcon}
          strokeWidth={2}
          className="size-5"
        />
      </span>
      {showWordmark && (
        <span className="font-heading text-xl font-semibold tracking-tight">
          Mise
        </span>
      )}
    </span>
  )
}
