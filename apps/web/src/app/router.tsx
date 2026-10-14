import { createBrowserRouter, Navigate } from "react-router"

import { AppShell } from "@/components/layout/app-shell"
import { LoginPage } from "@/features/auth/login-page"
import { RequireAuth } from "@/features/auth/require-auth"
import { SetupPage } from "@/features/auth/setup-page"
import { ListPage } from "@/features/list/list-page"
import { PantryPage } from "@/features/pantry/pantry-page"
import { PlanPage } from "@/features/plan/plan-page"
import { RecipesPage } from "@/features/recipes/recipes-page"
import { SettingsPage } from "@/features/settings/settings-page"
import { StyleguidePage } from "@/features/styleguide/styleguide-page"

import { NotFoundPage } from "./not-found-page"
import { RouteError } from "./route-error"

export const router = createBrowserRouter([
  { path: "/login", element: <LoginPage />, errorElement: <RouteError /> },
  { path: "/setup", element: <SetupPage />, errorElement: <RouteError /> },
  {
    element: (
      <RequireAuth>
        <AppShell />
      </RequireAuth>
    ),
    errorElement: <RouteError />,
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
