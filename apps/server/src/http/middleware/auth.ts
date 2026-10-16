import type { Context, MiddlewareHandler } from "hono"
import type { AppEnv } from "../../core/context.ts"
import { forHousehold } from "../../database/scope.ts"
import type { Auth } from "../../services/auth/auth.ts"
import { authenticate } from "../../services/auth/session.ts"
import { isAdminRole } from "../../services/households.ts"
import { ApiError } from "../errors.ts"

/**
 * Reads who sent each request (the auth service does the checking) and puts
 * them, and the household they're using, on the request.
 */
export function authenticateRequests(auth: Auth): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const found = await authenticate(auth, c.var.em, c.req.raw.headers)
    c.set("user", found?.user ?? null)
    c.set("session", found?.session ?? null)
    c.set("household", found?.household ?? null)
    await next()
  }
}

// What a route needs from whoever's asking. Each throws the standard error
// when it isn't so, and returns what the route can then rely on.

/** Someone must be signed in. */
export function signedIn(c: Context<AppEnv>) {
  const { user, session } = c.var
  if (!user || !session) {
    throw new ApiError(401, "signed_out", "Sign in first.")
  }
  return { user, session }
}

/** The server admin: whoever set the server up, and anyone they make one. */
export function serverAdmin(c: Context<AppEnv>) {
  const signed = signedIn(c)
  if (signed.user.role !== "admin") {
    throw new ApiError(
      403,
      "not_server_admin",
      "Only the server admin can do that."
    )
  }
  return signed
}

/**
 * The household in use on this device, with an entity manager that only
 * sees it.
 */
export function inHousehold(c: Context<AppEnv>) {
  const { user } = signedIn(c)
  const household = c.var.household
  if (!household) {
    throw new ApiError(403, "no_household", "You're not in a household.")
  }
  return {
    householdId: household.id,
    role: household.role,
    em: forHousehold(c.var.em, household.id),
    userId: user.id,
  }
}

/** The household in use, by one of its owners or admins. */
export function asHouseholdAdmin(c: Context<AppEnv>) {
  const household = inHousehold(c)
  if (!isAdminRole(household.role)) {
    throw new ApiError(
      403,
      "not_household_admin",
      "Only the household's admins can do that."
    )
  }
  return household
}
