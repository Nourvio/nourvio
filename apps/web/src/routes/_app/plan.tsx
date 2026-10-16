import { Calendar03Icon } from "@hugeicons/core-free-icons"
import { createFileRoute } from "@tanstack/react-router"
import { useTranslation } from "react-i18next"

import { ComingSoon } from "@/components/layout/coming-soon"

export const Route = createFileRoute("/_app/plan")({
  component: PlanPage,
})

function PlanPage() {
  const { t } = useTranslation()
  return (
    <ComingSoon
      title={t("nav.plan")}
      description={t("comingSoon.plan")}
      icon={Calendar03Icon}
    />
  )
}
