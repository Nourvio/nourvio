import * as React from "react"
import { Link, useLocation } from "react-router"

import { PageHeader } from "@/components/layout/page-header"
import { ModeToggleGroup } from "@/components/theme/mode-toggle"
import { PalettePicker } from "@/components/theme/palette-picker"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { useCurrentUser } from "@/features/auth/current-user"

import { AccountCard } from "./account-card"
import { AiCard } from "./ai-card"
import { HouseholdCard } from "./household-card"
import { MealieCard } from "./mealie-card"
import { ServerCard } from "./server-card"
import { TidyUpCard } from "./tidy-up-card"
import { useAiStatus } from "./use-ai"

export function SettingsPage() {
  const me = useCurrentUser()
  const ai = useAiStatus()
  const { hash } = useLocation()

  // Links like /settings#mealie jump to that card.
  React.useEffect(() => {
    if (hash) document.getElementById(hash.slice(1))?.scrollIntoView()
  }, [hash])

  return (
    <>
      <PageHeader title="Settings" />
      <div className="grid gap-6">
        <AccountCard />

        <Card>
          <CardHeader>
            <CardTitle>Appearance</CardTitle>
            <CardDescription>
              Saved to your account, so it follows you to every device.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <FieldGroup>
              <Field>
                <FieldLabel>Mode</FieldLabel>
                <ModeToggleGroup />
              </Field>
              <Field>
                <FieldLabel>Palette</FieldLabel>
                <PalettePicker />
              </Field>
            </FieldGroup>
          </CardContent>
        </Card>

        <HouseholdCard />
        {me.role === "admin" && ai.data?.available && <TidyUpCard />}

        {me.isServerAdmin && (
          <>
            <h2 className="pt-4 text-xl font-semibold">Running this server</h2>
            <ServerCard />
            <AiCard />
            <MealieCard />
          </>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Style guide</CardTitle>
            <CardDescription>
              Every component in the current theme.
            </CardDescription>
            <CardAction>
              <Button variant="outline" asChild>
                <Link to="/styleguide">Open</Link>
              </Button>
            </CardAction>
          </CardHeader>
        </Card>
      </div>
    </>
  )
}
