import { createFileRoute } from "@tanstack/react-router"

import { KrogerBasketPage } from "@/features/stores/kroger-basket-page"

export const Route = createFileRoute("/_app/list/kroger")({
  component: KrogerBasketPage,
})
