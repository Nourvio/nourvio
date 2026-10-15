import { useRouteError } from "react-router"

import { Logo } from "@/components/brand/logo"
import { Button } from "@/components/ui/button"

/** Shown instead of a page that crashed, so a bug doesn't leave a blank screen. */
export function RouteError() {
  const error = useRouteError()
  console.error(error)

  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-4 p-6 text-center">
      <Logo />
      <h1 className="text-2xl font-semibold">Something went wrong</h1>
      <p className="max-w-sm text-muted-foreground">
        This page hit an error. Reloading usually fixes it.
      </p>
      <Button onClick={() => window.location.reload()}>Reload</Button>
    </div>
  )
}
