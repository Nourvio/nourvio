import * as React from "react"
import type { User } from "@mise/shared"

/**
 * The signed-in user, provided by RequireAuth. Reading it from context (not
 * the session query) means components never see the moment between signing
 * out and being sent to the sign-in page.
 */
export const CurrentUserContext = React.createContext<User | null>(null)

export function useCurrentUser() {
  const user = React.useContext(CurrentUserContext)
  if (!user) throw new Error("useCurrentUser must be used inside RequireAuth")
  return user
}
