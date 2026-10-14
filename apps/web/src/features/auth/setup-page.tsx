import { setupInput } from "@mise/shared"
import { Navigate, useNavigate } from "react-router"

import { TextField } from "@/components/form/text-field"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { FieldGroup, FieldSeparator } from "@/components/ui/field"
import { Spinner } from "@/components/ui/spinner"
import { useForm } from "@/lib/form"

import { AuthLayout } from "./auth-layout"
import { useSetup, useSetupStatus } from "./use-session"

/** First run: create the admin account with the code from the server log. */
export function SetupPage() {
  const status = useSetupStatus()
  const navigate = useNavigate()
  const setup = useSetup()
  const form = useForm(setupInput, {
    code: "",
    displayName: "",
    username: "",
    password: "",
  })

  if (status.data && !status.data.needsSetup) {
    return <Navigate to="/login" replace />
  }

  function onSubmit(event: React.FormEvent) {
    event.preventDefault()
    const input = form.validate()
    if (!input) return
    setup.mutate(input, {
      onSuccess: () => navigate("/recipes", { replace: true }),
      onError: form.showError,
    })
  }

  return (
    <AuthLayout
      title="Set up Mise"
      description="Create the first account. You'll be the admin, and you can add the rest of the household afterwards."
    >
      <form onSubmit={onSubmit} noValidate className="grid gap-6">
        <FieldGroup>
          <TextField
            id="code"
            label="Setup code"
            autoComplete="off"
            autoCapitalize="characters"
            placeholder="ABCD-EFGH-JKMN"
            description={
              <>
                It's in the server log: <code>docker compose logs mise</code>,
                or the mise container's logs in Dockge.
              </>
            }
            error={form.errors.code}
            {...form.bind("code")}
          />
          <FieldSeparator />
          <TextField
            id="displayName"
            label="Your name"
            autoComplete="name"
            error={form.errors.displayName}
            {...form.bind("displayName")}
          />
          <TextField
            id="username"
            label="Username"
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            description="What you'll sign in with."
            error={form.errors.username}
            {...form.bind("username")}
          />
          <TextField
            id="password"
            label="Password"
            type="password"
            autoComplete="new-password"
            description="At least 10 characters."
            error={form.errors.password}
            {...form.bind("password")}
          />
        </FieldGroup>
        {form.formError && (
          <Alert variant="destructive">
            <AlertDescription>{form.formError}</AlertDescription>
          </Alert>
        )}
        <Button type="submit" size="lg" disabled={setup.isPending}>
          {setup.isPending && <Spinner data-icon="inline-start" />}
          Create account
        </Button>
      </form>
    </AuthLayout>
  )
}
