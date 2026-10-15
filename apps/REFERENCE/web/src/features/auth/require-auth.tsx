import type * as React from "react"
import { Navigate, useLocation } from "react-router"

import { Logo } from "@/components/brand/logo"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"

import { AppearanceSync } from "./appearance-sync"
import { CurrentUserContext } from "./current-user"
import { useSession, useSetupStatus } from "./use-session"

/** Shows its children only to a signed-in user; otherwise sends them to setup or sign-in. */
export function RequireAuth({ children }: { children: React.ReactNode }) {
  const session = useSession()
  const location = useLocation()
  const signedOut = session.data === null
  const setup = useSetupStatus(signedOut)

  if (session.isPending || (signedOut && setup.isPending)) {
    return (
      <FullScreen>
        <Spinner className="size-6 text-muted-foreground" />
      </FullScreen>
    )
  }

  if (session.isError) {
    return (
      <FullScreen>
        <p className="text-muted-foreground">
          Couldn't reach the Nourvio server.
        </p>
        <Button variant="outline" onClick={() => session.refetch()}>
          Try again
        </Button>
      </FullScreen>
    )
  }

  if (!session.data) {
    if (setup.data?.needsSetup) return <Navigate to="/setup" replace />
    const next = location.pathname + location.search
    const query = next === "/" ? "" : `?next=${encodeURIComponent(next)}`
    return <Navigate to={`/login${query}`} replace />
  }

  return (
    <CurrentUserContext.Provider value={session.data}>
      {children}
      <AppearanceSync user={session.data} />
    </CurrentUserContext.Provider>
  )
}

function FullScreen({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-4 p-6">
      <Logo />
      {children}
    </div>
  )
}
