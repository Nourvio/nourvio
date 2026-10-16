import type { EntityManager } from "@mikro-orm/sql"
import { resolveActiveHousehold, type ActiveHousehold } from "../households.ts"
import type { Auth } from "./auth.ts"

export type SignedIn = Auth["$Infer"]["Session"]

export type Authenticated = {
  user: SignedIn["user"]
  session: SignedIn["session"]
  /** The household in use, or null when they're in none. */
  household: ActiveHousehold | null
}

/**
 * Who sent a request, from its headers: by the session cookie today. Not
 * tied to HTTP routes, so anything that receives headers (MCP, say) can
 * check them the same way.
 */
export async function authenticate(
  auth: Auth,
  em: EntityManager,
  headers: Headers
): Promise<Authenticated | null> {
  const found = await auth.api.getSession({ headers })
  if (!found) return null

  const household = await resolveActiveHousehold(em, {
    userId: found.user.id,
    sessionId: found.session.id,
    activeHouseholdId: found.session.activeOrganizationId ?? null,
  })
  return { user: found.user, session: found.session, household }
}
