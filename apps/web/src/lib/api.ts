import type { ApiErrorBody } from "@mise/shared"

/** An error from the API, with its message and any per-field messages. */
export class ApiError extends Error {
  status: number
  fields: Record<string, string>

  constructor(status: number, body: ApiErrorBody | null) {
    super(body?.error ?? `Something went wrong (${status})`)
    this.status = status
    this.fields = body?.fields ?? {}
  }
}

type Options = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE"
  body?: unknown
}

/** Uploads a file (or several) as a multipart form, the way a browser form would. */
export async function apiUpload<T>(path: string, form: FormData): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method: "POST",
    body: form,
    credentials: "same-origin",
  })
  const data: unknown = await res.json().catch(() => null)
  if (!res.ok) throw new ApiError(res.status, data as ApiErrorBody | null)
  return data as T
}

/** Calls the Mise API (`/api` + path). Sends and receives JSON. */
export async function api<T = void>(
  path: string,
  { method, body }: Options = {}
): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method: method ?? (body === undefined ? "GET" : "POST"),
    headers:
      body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    credentials: "same-origin",
  })
  if (res.status === 204) return undefined as T
  const data: unknown = await res.json().catch(() => null)
  if (!res.ok) throw new ApiError(res.status, data as ApiErrorBody | null)
  return data as T
}
