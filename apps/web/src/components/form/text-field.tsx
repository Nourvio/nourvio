import type * as React from "react"

import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"

/** A labelled input with either a hint or an error underneath. */
export function TextField({
  id,
  label,
  error,
  description,
  ...inputProps
}: {
  id: string
  label: string
  error?: string
  description?: React.ReactNode
} & React.ComponentProps<typeof Input>) {
  const invalid = Boolean(error)
  return (
    <Field data-invalid={invalid || undefined}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input id={id} aria-invalid={invalid || undefined} {...inputProps} />
      {error ? (
        <FieldError>{error}</FieldError>
      ) : description ? (
        <FieldDescription>{description}</FieldDescription>
      ) : null}
    </Field>
  )
}
