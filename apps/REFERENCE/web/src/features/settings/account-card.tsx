import { changePasswordInput, displayNameSchema } from "@mise/shared"
import { toast } from "sonner"
import { z } from "zod"

import { TextField } from "@/components/form/text-field"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { FieldGroup, FieldLegend, FieldSet } from "@/components/ui/field"
import { Spinner } from "@/components/ui/spinner"
import { useCurrentUser } from "@/features/auth/current-user"
import {
  useChangePassword,
  useLogout,
  useUpdateMe,
} from "@/features/auth/use-session"
import { useForm } from "@/lib/form"

const nameInput = z.object({ displayName: displayNameSchema })

export function AccountCard() {
  const me = useCurrentUser()
  const logout = useLogout()

  return (
    <Card>
      <CardHeader>
        <CardTitle>Your account</CardTitle>
        <CardDescription>
          Signed in as {me.username}
          {me.isServerAdmin
            ? ", who runs this server"
            : me.role === "admin"
              ? ", a household admin"
              : ""}
          .
        </CardDescription>
        <CardAction>
          <Button
            variant="outline"
            onClick={() => logout.mutate()}
            disabled={logout.isPending}
          >
            Sign out
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="grid gap-8 md:grid-cols-2">
        <NameForm />
        <PasswordForm />
      </CardContent>
    </Card>
  )
}

function NameForm() {
  const me = useCurrentUser()
  const update = useUpdateMe()
  const form = useForm(nameInput, { displayName: me.displayName })

  function onSubmit(event: React.FormEvent) {
    event.preventDefault()
    const input = form.validate()
    if (!input) return
    update.mutate(input, {
      onSuccess: () => toast.success("Name saved"),
      onError: form.showError,
    })
  }

  return (
    <form onSubmit={onSubmit} noValidate>
      <FieldSet>
        <FieldLegend>Name</FieldLegend>
        <FieldGroup>
          <TextField
            id="account-name"
            label="Your name"
            autoComplete="name"
            error={form.errors.displayName}
            {...form.bind("displayName")}
          />
          <Button
            type="submit"
            variant="secondary"
            className="self-start"
            disabled={
              update.isPending || form.values.displayName === me.displayName
            }
          >
            {update.isPending && <Spinner data-icon="inline-start" />}
            Save name
          </Button>
        </FieldGroup>
      </FieldSet>
    </form>
  )
}

function PasswordForm() {
  const changePassword = useChangePassword()
  const form = useForm(changePasswordInput, {
    currentPassword: "",
    newPassword: "",
  })

  function onSubmit(event: React.FormEvent) {
    event.preventDefault()
    const input = form.validate()
    if (!input) return
    changePassword.mutate(input, {
      onSuccess: () => {
        form.reset()
        toast.success("Password changed", {
          description: "Your other devices were signed out.",
        })
      },
      onError: form.showError,
    })
  }

  return (
    <form onSubmit={onSubmit} noValidate>
      <FieldSet>
        <FieldLegend>Password</FieldLegend>
        <FieldGroup>
          <TextField
            id="current-password"
            label="Current password"
            type="password"
            autoComplete="current-password"
            error={form.errors.currentPassword}
            {...form.bind("currentPassword")}
          />
          <TextField
            id="new-password"
            label="New password"
            type="password"
            autoComplete="new-password"
            description="At least 10 characters."
            error={form.errors.newPassword}
            {...form.bind("newPassword")}
          />
          {form.formError && (
            <Alert variant="destructive">
              <AlertDescription>{form.formError}</AlertDescription>
            </Alert>
          )}
          <Button
            type="submit"
            variant="secondary"
            className="self-start"
            disabled={changePassword.isPending}
          >
            {changePassword.isPending && <Spinner data-icon="inline-start" />}
            Change password
          </Button>
        </FieldGroup>
      </FieldSet>
    </form>
  )
}
