import * as React from "react"
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
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { ApiError } from "@/lib/api"

import {
  useNutritionSettings,
  useSaveUsdaKey,
  useTestUsdaKey,
} from "./use-nutrition"

/** Server admin: the USDA FoodData Central key for calculated nutrition. */
export function NutritionCard() {
  const settings = useNutritionSettings()
  const save = useSaveUsdaKey()
  const test = useTestUsdaKey()
  const [editing, setEditing] = React.useState(false)
  const [key, setKey] = React.useState("")
  const [error, setError] = React.useState<string>()
  const busy = save.isPending || test.isPending
  const status = settings.data?.usdaKey
  const showInput =
    status && status.source !== "env" && (!status.configured || editing)

  function fail(e: unknown) {
    setError(e instanceof ApiError ? e.message : "Couldn't reach Mise")
  }

  function submit(event: React.FormEvent) {
    event.preventDefault()
    setError(undefined)
    const trimmed = key.trim()
    // Check the key works before keeping it.
    test.mutate(trimmed, {
      onSuccess: () =>
        save.mutate(trimmed, {
          onSuccess: () => {
            toast.success("USDA key saved")
            setKey("")
            setEditing(false)
          },
          onError: fail,
        }),
      onError: fail,
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Nutrition</CardTitle>
        <CardDescription>
          With a free USDA FoodData Central key, Mise calculates nutrition from
          each recipe's ingredients. Without one, the AI estimates it. A recipe
          site's own numbers are used first either way.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {settings.isPending ? (
          <Skeleton className="h-16" />
        ) : settings.isError || !status ? (
          <p className="text-sm text-muted-foreground">
            Couldn't load the nutrition settings.
          </p>
        ) : (
          <Field data-invalid={error ? true : undefined}>
            <FieldLabel htmlFor={showInput ? "usda-key" : undefined}>
              USDA API key
              {status.configured && (
                <Badge variant="secondary">
                  {status.source === "env" ? "Set on the server" : "Saved"}
                </Badge>
              )}
            </FieldLabel>
            {showInput ? (
              <form className="flex flex-wrap gap-2" onSubmit={submit}>
                <Input
                  id="usda-key"
                  type="password"
                  autoComplete="off"
                  spellCheck={false}
                  className="min-w-0 flex-1 basis-56"
                  value={key}
                  aria-invalid={error ? true : undefined}
                  onChange={(event) => setKey(event.target.value)}
                />
                <Button type="submit" disabled={busy || key.trim().length < 10}>
                  {busy && <Spinner data-icon="inline-start" />}
                  Save
                </Button>
                {editing && (
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => {
                      setEditing(false)
                      setError(undefined)
                    }}
                  >
                    Cancel
                  </Button>
                )}
              </form>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <code className="rounded-md bg-muted px-2 py-1 text-sm">
                  {status.hint}
                </code>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busy}
                  onClick={() => {
                    setError(undefined)
                    test.mutate(undefined, {
                      onSuccess: () => toast.success("USDA key works"),
                      onError: fail,
                    })
                  }}
                >
                  {test.isPending && <Spinner data-icon="inline-start" />}
                  Test
                </Button>
                {status.source === "settings" && (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={busy}
                      onClick={() => setEditing(true)}
                    >
                      Replace
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={busy}
                      onClick={() =>
                        save.mutate(null, {
                          onSuccess: () => toast.success("USDA key removed"),
                          onError: fail,
                        })
                      }
                    >
                      Remove
                    </Button>
                  </>
                )}
              </div>
            )}
            {error ? (
              <FieldError>{error}</FieldError>
            ) : (
              <FieldDescription>
                {status.source === "env" ? (
                  <>
                    Change it with <code>USDA_API_KEY</code> on the server.
                  </>
                ) : status.configured ? (
                  "Stored encrypted. Only the last four characters are shown."
                ) : (
                  <>
                    Get one free at{" "}
                    <a
                      href="https://api.data.gov/signup/"
                      target="_blank"
                      rel="noreferrer"
                      className="underline underline-offset-4"
                    >
                      api.data.gov
                    </a>{" "}
                    (just a name and email). It allows 1,000 lookups an hour,
                    and each food is only looked up once.
                  </>
                )}
              </FieldDescription>
            )}
          </Field>
        )}
      </CardContent>
    </Card>
  )
}
