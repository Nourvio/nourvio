import { FridgeIcon } from "@hugeicons/core-free-icons"
import { createFileRoute } from "@tanstack/react-router"
import { useTranslation } from "react-i18next"

import { ComingSoon } from "@/components/layout/coming-soon"

export const Route = createFileRoute("/_app/pantry")({
  component: PantryPage,
})

function PantryPage() {
  const { t } = useTranslation()
  return (
    <ComingSoon
      title={t("nav.pantry")}
      description={t("comingSoon.pantry")}
      icon={FridgeIcon}
    />
  )
}
