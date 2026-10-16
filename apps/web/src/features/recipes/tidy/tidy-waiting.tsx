import { AiMagicIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useQuery } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"

import { Button } from "@/components/ui/button"
import { useCapability } from "@/features/capabilities/queries"

import { recipeTidyQuery } from "./queries"

/** On a recipe: tidy up's suggestions waiting for it, and the way to them. */
export function TidyWaiting({
  recipeId,
  onReview,
}: {
  recipeId: string
  onReview: () => void
}) {
  const { t } = useTranslation()
  const aiOn = useCapability("ai")
  const { data } = useQuery({ ...recipeTidyQuery(recipeId), enabled: aiOn })
  const proposal = data?.proposal
  if (!proposal) return null
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-2xl border bg-card px-4 py-3 text-sm">
      <HugeiconsIcon
        icon={AiMagicIcon}
        strokeWidth={2}
        className="size-4 shrink-0 text-primary"
      />
      <span className="min-w-0 flex-1">
        {t("recipes.tidy.waitingHere", { summary: proposal.summary })}
      </span>
      <Button variant="outline" size="sm" onClick={onReview}>
        {t("recipes.tidy.review")}
      </Button>
    </div>
  )
}
