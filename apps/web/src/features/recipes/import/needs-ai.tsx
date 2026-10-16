import { AiMagicIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useQuery } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import { Trans, useTranslation } from "react-i18next"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { householdAiQuery } from "@/features/ai/queries"
import { householdQuery, isAdminRole } from "@/features/household/queries"

/**
 * Whether the household can import with AI, and if not, why. Undefined
 * until it's known.
 */
export function useImportAi() {
  const { data } = useQuery(householdAiQuery)
  const task = data?.status.tasks.import
  return {
    ready: task?.ok,
    why: task && !task.ok ? task.why : null,
  }
}

/** Why text and photos can't be read, and who can set AI up. */
export function NeedsAi({
  why,
  onNavigate,
}: {
  why: "noKey" | "notCovered" | "overLimit" | "ownLimit"
  /** Following the link to Settings closes the dialog. */
  onNavigate?: () => void
}) {
  const { t } = useTranslation()
  const { data: household } = useQuery(householdQuery)
  return (
    <Alert>
      <HugeiconsIcon icon={AiMagicIcon} strokeWidth={2} />
      <AlertDescription>
        <p>
          {t(`recipes.import.ai.why.${why}`)}{" "}
          {isAdminRole(household?.role) ? (
            <Trans
              i18nKey="recipes.import.ai.fixAdmin"
              components={{
                link: (
                  <Link
                    to="/settings/household"
                    className="underline underline-offset-3"
                    onClick={onNavigate}
                  />
                ),
              }}
            />
          ) : (
            t("recipes.import.ai.fixMember")
          )}
        </p>
      </AlertDescription>
    </Alert>
  )
}
