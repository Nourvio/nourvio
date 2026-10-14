import { loginInput } from "@mise/shared"
import { Link, Navigate, useNavigate, useSearchParams } from "react-router"

import { TextField } from "@/components/form/text-field"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { FieldGroup } from "@/components/ui/field"
import { Spinner } from "@/components/ui/spinner"
import { useForm } from "@/lib/form"

import { AuthLayout } from "./auth-layout"
import { useLogin, useSession, useSetupStatus } from "./use-session"

/** Only follow `next` to a page in this app, never to another site. */
function safeNext(next: string | null) {
  return next && next.startsWith("/") && !next.startsWith("//")
    ? next
    : "/recipes"
}

export function LoginPage() {
  const session = useSession()
  const setup = useSetupStatus()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const next = safeNext(params.get("next"))
  const login = useLogin()
  const form = useForm(loginInput, { username: "", password: "" })

  if (session.data) return <Navigate to={next} replace />
  if (setup.data?.needsSetup) return <Navigate to="/setup" replace />

  function onSubmit(event: React.FormEvent) {
    event.preventDefault()
    const input = form.validate()
    if (!input) return
    login.mutate(input, {
      onSuccess: () => navigate(next, { replace: true }),
      onError: form.showError,
    })
  }

  return (
    <AuthLayout title="Sign in" description="Welcome back to the kitchen.">
      <form onSubmit={onSubmit} noValidate className="grid gap-6">
        <FieldGroup>
          <TextField
            id="username"
            label="Username"
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            autoFocus
            error={form.errors.username}
            {...form.bind("username")}
          />
          <TextField
            id="password"
            label="Password"
            type="password"
            autoComplete="current-password"
            error={form.errors.password}
            {...form.bind("password")}
          />
        </FieldGroup>
        {form.formError && (
          <Alert variant="destructive">
            <AlertDescription>{form.formError}</AlertDescription>
          </Alert>
        )}
        <Button type="submit" size="lg" disabled={login.isPending}>
          {login.isPending && <Spinner data-icon="inline-start" />}
          Sign in
        </Button>
        <p className="text-center text-sm text-muted-foreground">
          {setup.data?.signupOpen ? (
            <>
              New here?{" "}
              <Link
                to="/signup"
                className="font-medium text-foreground underline underline-offset-4"
              >
                Create an account
              </Link>
            </>
          ) : (
            "New here? Ask someone in your household for an invite link."
          )}
        </p>
      </form>
    </AuthLayout>
  )
}
