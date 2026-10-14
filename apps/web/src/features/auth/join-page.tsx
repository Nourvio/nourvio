import { joinInput } from "@mise/shared"
import { Link, useNavigate, useParams } from "react-router"

import { TextField } from "@/components/form/text-field"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { FieldGroup } from "@/components/ui/field"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { ApiError } from "@/lib/api"
import { useForm } from "@/lib/form"

import { AuthLayout } from "./auth-layout"
import { useInvitePreview, useJoin } from "./use-join"
import { useLogout, useSession } from "./use-session"

/** Opening an invite link: create an account in the inviting household. */
export function JoinPage() {
  const { token = "" } = useParams()
  const session = useSession()
  const invite = useInvitePreview(token)
  const logout = useLogout()

  if (invite.isPending || session.isPending) {
    return (
      <AuthLayout title="Joining…" description="Checking the invite link.">
        <Skeleton className="h-40" />
      </AuthLayout>
    )
  }

  if (invite.isError) {
    return (
      <AuthLayout
        title="That link doesn't work"
        description={
          invite.error instanceof ApiError
            ? invite.error.message
            : "Couldn't check the link. Try again in a moment."
        }
      >
        <Button variant="outline" className="w-full" asChild>
          <Link to="/login">Go to sign in</Link>
        </Button>
      </AuthLayout>
    )
  }

  const { householdName, invitedBy } = invite.data
  const title = `Join ${householdName}`

  // One household per account: joining means a new account.
  if (session.data) {
    return (
      <AuthLayout
        title={title}
        description={`You're signed in as ${session.data.displayName}. To join ${householdName}, sign out and make a new account with this link.`}
      >
        <div className="grid gap-2">
          <Button disabled={logout.isPending} onClick={() => logout.mutate()}>
            Sign out
          </Button>
          <Button variant="outline" asChild>
            <Link to="/recipes">Stay signed in</Link>
          </Button>
        </div>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout
      title={title}
      description={`${invitedBy ?? "Someone"} invited you to share recipes and plans in Mise. Make an account to join.`}
    >
      <JoinForm token={token} />
    </AuthLayout>
  )
}

function JoinForm({ token }: { token: string }) {
  const navigate = useNavigate()
  const join = useJoin(token)
  const form = useForm(joinInput, {
    displayName: "",
    username: "",
    password: "",
  })

  function onSubmit(event: React.FormEvent) {
    event.preventDefault()
    const input = form.validate()
    if (!input) return
    join.mutate(input, {
      onSuccess: () => navigate("/", { replace: true }),
      onError: form.showError,
    })
  }

  return (
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
      </FieldGroup>
      {form.formError && (
        <Alert variant="destructive">
          <AlertDescription>{form.formError}</AlertDescription>
        </Alert>
      )}
      <Button type="submit" size="lg" disabled={join.isPending}>
        {join.isPending && <Spinner data-icon="inline-start" />}
        Join
      </Button>
    </form>
  )
}
