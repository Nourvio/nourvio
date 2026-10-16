import { Home01Icon } from "@hugeicons/core-free-icons"
import { createFileRoute } from "@tanstack/react-router"
import { useTranslation } from "react-i18next"

import { ComingSoon } from "@/components/layout/coming-soon"

export const Route = createFileRoute("/_app/")({
  component: TodayPage,
})

function TodayPage() {
  const { t } = useTranslation()
  return (
    <ComingSoon
      title={t("nav.today")}
      description={t("comingSoon.today")}
      icon={Home01Icon}
    />
  )
}
