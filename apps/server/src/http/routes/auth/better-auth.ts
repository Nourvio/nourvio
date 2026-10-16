import type { OpenAPIHono } from "@hono/zod-openapi"
import type { AppEnv } from "../../../core/context.ts"
import type { Auth } from "../../../services/auth/auth.ts"

/**
 * The Better Auth endpoints Merran uses, and only those, under /api/auth.
 * Better Auth offers many more (its own member and invitation management,
 * admin tools, social sign-in); they stay shut, so nothing gets around
 * Merran's own rules. A feature that needs one adds it here, and it appears
 * in the API reference.
 */
export const BETTER_AUTH_ENDPOINTS = [
  { method: "POST", path: "/sign-in/username", signedIn: false },
  { method: "POST", path: "/sign-in/email", signedIn: false },
  { method: "POST", path: "/sign-out", signedIn: true },
  { method: "GET", path: "/get-session", signedIn: true },
  { method: "GET", path: "/list-sessions", signedIn: true },
  { method: "POST", path: "/revoke-session", signedIn: true },
  { method: "POST", path: "/revoke-other-sessions", signedIn: true },
  { method: "POST", path: "/revoke-sessions", signedIn: true },
  { method: "POST", path: "/change-password", signedIn: true },
  { method: "POST", path: "/update-user", signedIn: true },
  { method: "POST", path: "/organization/set-active", signedIn: true },
] as const

/**
 * Hands those endpoints to Better Auth. They answer in Better Auth's own
 * error shape, not Merran's.
 */
export function mountBetterAuth(router: OpenAPIHono<AppEnv>, auth: Auth) {
  for (const { method, path } of BETTER_AUTH_ENDPOINTS) {
    router.on(method, `/auth${path}`, (c) => auth.handler(c.req.raw))
  }
}
