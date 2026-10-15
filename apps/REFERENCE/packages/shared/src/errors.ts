import type { z } from "zod"

/** The JSON body of every API error. `fields` maps form field names to messages. */
export type ApiErrorBody = {
  error: string
  fields?: Record<string, string>
}

/** The first message for each top-level field, ready to show under a form input. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const fields: Record<string, string> = {}
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form")
    fields[key] ??= issue.message
  }
  return fields
}
