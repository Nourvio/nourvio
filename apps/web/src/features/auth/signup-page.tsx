import { signupInput } from "@mise/shared"
import { Link, Navigate, useNavigate } from "react-router"

import { TextField } from "@/components/form/text-field"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { FieldGroup } from "@/components/ui/field"
import { Spinner } from "@/components/ui/spinner"
import { useForm } from "@/lib/form"

import { AuthLayout } from "./auth-layout"
import { useSignup } from "./use-join"
import { useSession, useSetupStatus } from "./use-session"

/** Open sign-up (when the server allows it): a new account and household. */
export function SignupPage() {
  const session = useSession()
  const status = useSetupStatus()
  const navigate = useNavigate()
  const signup = useSignup()
  const form = useForm(signupInput, {
    displayName: "",
    username: "",
    password: "",
    householdName: "",
  })

  if (session.data) return <Navigate to="/" replace />
  if (status.data?.needsSetup) return <Navigate to="/setup" replace />

  if (status.data && !status.data.signupOpen) {
    return (
      <AuthLayout
        title="Sign-up is off"
        description="This Nourvio only lets people in by invite. Ask someone in your household to send you an invite link."
      >
        <Button variant="outline" className="w-full" asChild>
          <Link to="/login">Sign in instead</Link>
        </Button>
      </AuthLayout>
    )
  }

  function onSubmit(event: React.FormEvent) {
    event.preventDefault()
    const input = form.validate()
    if (!input) return
    signup.mutate(input, {
      onSuccess: () => navigate("/", { replace: true }),
      onError: form.showError,
    })
  }

  return (
    <AuthLayout
      title="Create an account"
      description="You'll start your own household. Invite the rest of the family once you're in."
    >
      <form onSubmit={onSubmit} noValidate className="grid gap-6">
        <FieldGroup>
          <TextField
            id="displayName"
            label="Your name"
            autoComplete="name"
            autoFocus
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
          <TextField
            id="householdName"
            label="Household name"
            placeholder="The Johnsons"
            error={form.errors.householdName}
            {...form.bind("householdName")}
          />
        </FieldGroup>
        {form.formError && (
          <Alert variant="destructive">
            <AlertDescription>{form.formError}</AlertDescription>
          </Alert>
        )}
        <Button type="submit" size="lg" disabled={signup.isPending}>
          {signup.isPending && <Spinner data-icon="inline-start" />}
          Create account
        </Button>
        <p className="text-center text-sm text-muted-foreground">
          Already have one?{" "}
          <Link
            to="/login"
            className="font-medium text-foreground underline underline-offset-4"
          >
            Sign in
          </Link>
        </p>
      </form>
    </AuthLayout>
  )
}
