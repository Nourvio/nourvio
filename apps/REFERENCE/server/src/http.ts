import { getConnInfo } from "@hono/node-server/conninfo"
import { fieldErrors } from "@mise/shared"
import type { Context } from "hono"
import type { ContentfulStatusCode } from "hono/utils/http-status"
import type { z } from "zod"

/** An error with a message that's safe to show the user. */
export class HttpError extends Error {
  status: ContentfulStatusCode
  fields?: Record<string, string>
  headers?: Record<string, string>

  constructor(
    status: ContentfulStatusCode,
    message: string,
    extra: {
      fields?: Record<string, string>
      headers?: Record<string, string>
    } = {}
  ) {
    super(message)
    this.status = status
    this.fields = extra.fields
    this.headers = extra.headers
  }
}

export function tooManyAttempts(retryAfterSeconds: number) {
  const minutes = Math.max(1, Math.ceil(retryAfterSeconds / 60))
  return new HttpError(
    429,
    `Too many attempts. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`,
    { headers: { "Retry-After": String(retryAfterSeconds) } }
  )
}

/** Parses and validates a JSON body, or throws a 400 with per-field messages. */
export async function readBody<T extends z.ZodType>(
  c: Context,
  schema: T
): Promise<z.output<T>> {
  let body: unknown
  try {
    body = await c.req.json()
  } catch {
    throw new HttpError(400, "Expected a JSON body")
  }
  const result = schema.safeParse(body)
  if (!result.success) {
    throw new HttpError(400, "Check the highlighted fields", {
      fields: fieldErrors(result.error),
    })
  }
  return result.data
}

/** Best guess at the caller's IP, for rate limiting. Behind Cloudflare it's CF-Connecting-IP. */
export function clientIp(c: Context) {
  const forwarded =
    c.req.header("cf-connecting-ip") ??
    c.req.header("x-forwarded-for")?.split(",")[0]?.trim()
  if (forwarded) return forwarded
  try {
    return getConnInfo(c).remote.address ?? "unknown"
  } catch {
    return "unknown"
  }
}
