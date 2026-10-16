import { CookBookIcon } from "@hugeicons/core-free-icons"
import { createFileRoute } from "@tanstack/react-router"
import { useTranslation } from "react-i18next"

import { ComingSoon } from "@/components/layout/coming-soon"

export const Route = createFileRoute("/_app/recipes")({
  component: RecipesPage,
})

function RecipesPage() {
  const { t } = useTranslation()
  return (
    <ComingSoon
      title={t("nav.recipes")}
      description={t("comingSoon.recipes")}
      icon={CookBookIcon}
    />
  )
}
