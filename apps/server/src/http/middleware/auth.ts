import type { Context, MiddlewareHandler } from "hono"
import type { AppEnv } from "../../core/context.ts"
import { forHousehold } from "../../database/scope.ts"
import {
  allows,
  type ApiAccess,
  type ApiArea,
} from "../../services/auth/api-keys.ts"
import type { Auth } from "../../services/auth/auth.ts"
import { KeyRateLimit } from "../../services/auth/key-rate-limit.ts"
import { authenticate } from "../../services/auth/session.ts"
import { isAdminRole } from "../../services/households.ts"
import { ApiError } from "../errors.ts"

/**
 * Reads who sent each request (the auth service does the checking) and puts
 * them, the household they're using, and any API key they used on the
 * request. Requests with a key are also held to the key's rate limit.
 */
export function authenticateRequests(
  auth: Auth,
  limit = new KeyRateLimit()
): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const found = await authenticate(auth, c.var.em, c.req.raw.headers)
    if (found?.apiKey) {
      const hit = limit.hit(found.apiKey.id)
      if (!hit.ok) {
        c.header("Retry-After", String(hit.retryAfter))
        throw new ApiError(
          429,
          "rate_limited",
          `This API key has made too many requests. Try again in ${hit.retryAfter} seconds.`
        )
      }
    }
    c.set("user", found?.user ?? null)
    c.set("session", found?.session ?? null)
    c.set("household", found?.household ?? null)
    c.set("apiKey", found?.apiKey ?? null)
    await next()
  }
}

// What a route needs from whoever's asking. Each throws the standard error
// when it isn't so, and returns what the route can then rely on. API keys
// are refused unless a route says which permission lets one in.

/** A person signed in with a session. API keys can't do this. */
export function signedIn(c: Context<AppEnv>) {
  const { user, session, apiKey } = c.var
  if (apiKey) {
    throw new ApiError(
      403,
      "api_key_not_allowed",
      "API keys can't do this. Sign in instead."
    )
  }
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
 * The household in use, with an entity manager that only sees it: the one
 * on this device for someone signed in, or the key's own household. An API
 * key gets in only when the route names a permission and the key has it.
 */
export function inHousehold(
  c: Context<AppEnv>,
  permission?: { area: ApiArea; access: ApiAccess }
) {
  const { user, apiKey } = c.var
  if (apiKey) {
    if (!permission) {
      throw new ApiError(
        403,
        "api_key_not_allowed",
        "API keys can't do this. Sign in instead."
      )
    }
    if (!allows(apiKey.permissions, permission.area, permission.access)) {
      throw new ApiError(
        403,
        "missing_permission",
        `This API key can't ${permission.access} ${permission.area}.`
      )
    }
  } else {
    signedIn(c)
  }

  const household = c.var.household
  if (!user || !household) {
    throw new ApiError(403, "no_household", "You're not in a household.")
  }
  return {
    householdId: household.id,
    role: household.role,
    em: forHousehold(c.var.em, household.id),
    userId: user.id,
  }
}

/** The household in use, by one of its owners or admins, signed in: never a key. */
export function asHouseholdAdmin(c: Context<AppEnv>) {
  signedIn(c)
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
