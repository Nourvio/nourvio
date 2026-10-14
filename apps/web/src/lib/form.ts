import * as React from "react"
import { fieldErrors } from "@mise/shared"
import type { z } from "zod"

import { ApiError } from "./api"

/**
 * Form state validated with a shared Zod schema. The same schema runs on the
 * server, and its per-field errors come back through `showError`.
 */
export function useForm<T extends Record<string, string>, Out>(
  schema: z.ZodType<Out, T>,
  initial: T
) {
  const [values, setValues] = React.useState(initial)
  const [errors, setErrors] = React.useState<Record<string, string>>({})
  const [formError, setFormError] = React.useState<string | null>(null)

  function bind(name: keyof T & string) {
    return {
      name,
      value: values[name],
      onChange: (event: React.ChangeEvent<HTMLInputElement>) =>
        setValues((current) => ({ ...current, [name]: event.target.value })),
    }
  }

  /** The parsed values, or null after showing what's wrong. */
  function validate(): Out | null {
    const result = schema.safeParse(values)
    setFormError(null)
    if (!result.success) {
      setErrors(fieldErrors(result.error))
      return null
    }
    setErrors({})
    return result.data
  }

  function showError(error: unknown) {
    if (error instanceof ApiError) {
      setErrors(error.fields)
      setFormError(Object.keys(error.fields).length ? null : error.message)
    } else {
      setFormError("Something went wrong. Try again.")
    }
  }

  function reset() {
    setValues(initial)
    setErrors({})
    setFormError(null)
  }

  return {
    values,
    setValues,
    errors,
    formError,
    bind,
    validate,
    showError,
    reset,
  }
}
