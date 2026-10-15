import * as React from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import { Copy01Icon } from "@hugeicons/core-free-icons"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { ApiError } from "@/lib/api"

import { useKrogerApp, useSaveKrogerApp } from "./use-shop"

/** Server admin: the free Kroger developer app that Fry's and other Kroger stores sign in through. */
export function KrogerAppCard() {
  const app = useKrogerApp(true)
  const save = useSaveKrogerApp()
  const [editing, setEditing] = React.useState(false)
  const [clientId, setClientId] = React.useState("")
  const [secret, setSecret] = React.useState("")
  const [error, setError] = React.useState<string>()

  const data = app.data
  const configured = Boolean(data?.secretHint)
  const showForm = data && data.source !== "env" && (!configured || editing)

  function submit(event: React.FormEvent) {
    event.preventDefault()
    setError(undefined)
    save.mutate(
      { clientId: clientId.trim(), clientSecret: secret.trim() },
      {
        onSuccess: () => {
          toast.success("Kroger app saved")
          setEditing(false)
          setSecret("")
        },
        onError: (e) =>
          setError(e instanceof ApiError ? e.message : "Couldn't save that"),
      }
    )
  }

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text)
      toast.success("Copied")
    } catch {
      toast.error("Couldn't copy; select it instead")
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Kroger</CardTitle>
        <CardDescription>
          Fry's and the other Kroger stores (Ralphs, King Soopers, Smith's,
          Harris Teeter…) fill a household's cart through Kroger's official API.
          It's free: make an app at developer.kroger.com and paste its details
          here.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {app.isPending ? (
          <Skeleton className="h-24" />
        ) : !data ? (
          <p className="text-sm text-muted-foreground">
            Couldn't load the Kroger settings.
          </p>
        ) : (
          <>
            <ol className="grid list-decimal gap-1.5 pl-5 text-sm text-muted-foreground">
              <li>
                Sign in at{" "}
                <a
                  href="https://developer.kroger.com"
                  target="_blank"
                  rel="noreferrer"
                  className="font-medium text-foreground underline underline-offset-4"
                >
                  developer.kroger.com
                </a>{" "}
                and register an app in the Production environment.
              </li>
              <li>
                Give it the Product, Cart and Profile scopes (product.compact,
                cart.basic:write, profile.compact).
              </li>
              <li>Add this redirect URI to the app:</li>
            </ol>
            <div className="flex items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded-xl bg-muted px-3 py-2 text-sm">
                {data.redirectUri}
              </code>
              <Button
                variant="outline"
                size="icon"
                aria-label="Copy the redirect URI"
                onClick={() => copy(data.redirectUri)}
              >
                <HugeiconsIcon icon={Copy01Icon} strokeWidth={2} />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              It's this address as you're seeing it now. If people reach Nourvio
              at another address too, set PUBLIC_URL on the server so it stays
              the same.
            </p>

            {data.source === "env" ? (
              <p className="flex items-center gap-2 text-sm">
                <Badge variant="secondary">From the server</Badge>
                Client {data.clientId}, secret {data.secretHint}
              </p>
            ) : showForm ? (
              <form onSubmit={submit}>
                <FieldGroup>
                  <Field>
                    <FieldLabel htmlFor="kroger-client-id">
                      Client ID
                    </FieldLabel>
                    <Input
                      id="kroger-client-id"
                      value={clientId}
                      onChange={(event) => setClientId(event.target.value)}
                      autoComplete="off"
                      required
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="kroger-secret">
                      Client secret
                    </FieldLabel>
                    <Input
                      id="kroger-secret"
                      type="password"
                      value={secret}
                      onChange={(event) => setSecret(event.target.value)}
                      autoComplete="off"
                      required
                    />
                    <FieldDescription>
                      Kept encrypted on the server.
                    </FieldDescription>
                    {error && <FieldError>{error}</FieldError>}
                  </Field>
                  <div className="flex gap-2">
                    <Button type="submit" disabled={save.isPending}>
                      {save.isPending && <Spinner data-icon="inline-start" />}
                      Save
                    </Button>
                    {editing && (
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => setEditing(false)}
                      >
                        Cancel
                      </Button>
                    )}
                  </div>
                </FieldGroup>
              </form>
            ) : (
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span>
                  Client <span className="font-medium">{data.clientId}</span>,
                  secret {data.secretHint}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setClientId(data.clientId ?? "")
                    setEditing(true)
                  }}
                >
                  Change
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={save.isPending}
                  onClick={() =>
                    save.mutate(
                      { clientId: null },
                      { onSuccess: () => toast.success("Kroger app removed") }
                    )
                  }
                >
                  Remove
                </Button>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}
