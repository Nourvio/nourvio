import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { RouterProvider } from "react-router/dom"

import "./index.css"
import { AppProviders } from "@/app/providers"
import { router } from "@/app/router"
import { registerServiceWorker } from "@/features/share/shared-files"

registerServiceWorker()

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AppProviders>
      <RouterProvider router={router} />
    </AppProviders>
  </StrictMode>
)
