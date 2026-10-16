import { ShoppingBasket01Icon } from "@hugeicons/core-free-icons"
import { createFileRoute } from "@tanstack/react-router"
import { useTranslation } from "react-i18next"

import { ComingSoon } from "@/components/layout/coming-soon"

export const Route = createFileRoute("/_app/list")({
  component: ListPage,
})

function ListPage() {
  const { t } = useTranslation()
  return (
    <ComingSoon
      title={t("nav.list")}
      description={t("comingSoon.list")}
      icon={ShoppingBasket01Icon}
    />
  )
}
