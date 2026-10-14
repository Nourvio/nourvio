import { Link } from "react-router"

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
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { useCurrentUser } from "@/features/auth/current-user"

import { AccountCard } from "./account-card"
import { HouseholdCard } from "./household-card"

export function SettingsPage() {
  const me = useCurrentUser()

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

        {me.role === "admin" && (
          <Card>
            <CardHeader>
              <CardTitle>AI providers</CardTitle>
              <CardDescription>
                Add a Claude or OpenAI key to turn on import, cleanup and the
                assistant. Arrives in milestone 1.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <FieldGroup>
                <Field data-disabled>
                  <FieldLabel htmlFor="anthropic-key">
                    Anthropic API key
                  </FieldLabel>
                  <Input
                    id="anthropic-key"
                    type="password"
                    placeholder="sk-ant-"
                    disabled
                  />
                  <FieldDescription>
                    Or set <code>ANTHROPIC_API_KEY</code> on the server.
                  </FieldDescription>
                </Field>
                <Field data-disabled>
                  <FieldLabel htmlFor="openai-key">OpenAI API key</FieldLabel>
                  <Input
                    id="openai-key"
                    type="password"
                    placeholder="sk-"
                    disabled
                  />
                  <FieldDescription>
                    Or set <code>OPENAI_API_KEY</code> on the server.
                  </FieldDescription>
                </Field>
              </FieldGroup>
            </CardContent>
          </Card>
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
