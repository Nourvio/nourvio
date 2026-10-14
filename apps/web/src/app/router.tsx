import { createBrowserRouter, Navigate } from "react-router"

import { AppShell } from "@/components/layout/app-shell"
import { ListPage } from "@/features/list/list-page"
import { PantryPage } from "@/features/pantry/pantry-page"
import { PlanPage } from "@/features/plan/plan-page"
import { RecipesPage } from "@/features/recipes/recipes-page"
import { SettingsPage } from "@/features/settings/settings-page"
import { StyleguidePage } from "@/features/styleguide/styleguide-page"

import { NotFoundPage } from "./not-found-page"

export const router = createBrowserRouter([
  {
    element: <AppShell />,
    children: [
      { index: true, element: <Navigate to="/recipes" replace /> },
      { path: "recipes", element: <RecipesPage /> },
      { path: "plan", element: <PlanPage /> },
      { path: "list", element: <ListPage /> },
      { path: "pantry", element: <PantryPage /> },
      { path: "settings", element: <SettingsPage /> },
      { path: "styleguide", element: <StyleguidePage /> },
      { path: "*", element: <NotFoundPage /> },
    ],
  },
])
