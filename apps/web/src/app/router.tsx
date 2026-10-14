import { createBrowserRouter, Outlet, ScrollRestoration } from "react-router"

import { AppShell } from "@/components/layout/app-shell"
import { JoinPage } from "@/features/auth/join-page"
import { LoginPage } from "@/features/auth/login-page"
import { RequireAuth } from "@/features/auth/require-auth"
import { SetupPage } from "@/features/auth/setup-page"
import { SignupPage } from "@/features/auth/signup-page"
import { CookPage } from "@/features/cook/cook-page"
import { CollectionPage, DiscoverPage } from "@/features/discover/discover-page"
import { HomePage } from "@/features/home/home-page"
import { ListPage } from "@/features/list/list-page"
import { PantryPage } from "@/features/pantry/pantry-page"
import { PlanPage } from "@/features/plan/plan-page"
import {
  EditRecipePage,
  NewRecipePage,
} from "@/features/recipes/recipe-editor-page"
import { RecipePage } from "@/features/recipes/recipe-page"
import { RecipesPage } from "@/features/recipes/recipes-page"
import { ReviewPage } from "@/features/recipes/review-page"
import { SettingsPage } from "@/features/settings/settings-page"
import { StyleguidePage } from "@/features/styleguide/styleguide-page"

import { NotFoundPage } from "./not-found-page"
import { RouteError } from "./route-error"

/** Every page opens at the top, and Back returns to where you were. */
function Root() {
  return (
    <>
      <ScrollRestoration />
      <Outlet />
    </>
  )
}

export const router = createBrowserRouter([
  {
    element: <Root />,
    errorElement: <RouteError />,
    children: [
      { path: "/login", element: <LoginPage />, errorElement: <RouteError /> },
      { path: "/setup", element: <SetupPage />, errorElement: <RouteError /> },
      {
        path: "/signup",
        element: <SignupPage />,
        errorElement: <RouteError />,
      },
      {
        path: "/join/:token",
        element: <JoinPage />,
        errorElement: <RouteError />,
      },
      {
        // Full screen, without the app's navigation, for cooking.
        path: "/recipes/:slug/cook",
        element: (
          <RequireAuth>
            <CookPage />
          </RequireAuth>
        ),
        errorElement: <RouteError />,
      },
      {
        element: (
          <RequireAuth>
            <AppShell />
          </RequireAuth>
        ),
        errorElement: <RouteError />,
        children: [
          { index: true, element: <HomePage /> },
          { path: "recipes", element: <RecipesPage /> },
          { path: "recipes/new", element: <NewRecipePage /> },
          { path: "recipes/:slug", element: <RecipePage /> },
          { path: "recipes/:slug/edit", element: <EditRecipePage /> },
          { path: "review", element: <ReviewPage /> },
          { path: "discover", element: <DiscoverPage /> },
          { path: "discover/:id", element: <CollectionPage /> },
          { path: "plan", element: <PlanPage /> },
          { path: "list", element: <ListPage /> },
          { path: "pantry", element: <PantryPage /> },
          { path: "settings", element: <SettingsPage /> },
          { path: "styleguide", element: <StyleguidePage /> },
          { path: "*", element: <NotFoundPage /> },
        ],
      },
    ],
  },
])
