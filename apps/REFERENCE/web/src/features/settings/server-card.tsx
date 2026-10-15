import * as React from "react"
import type { HouseholdSummary } from "@mise/shared"
import { toast } from "sonner"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field"
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from "@/components/ui/item"
import { Skeleton } from "@/components/ui/skeleton"
import { ApiError } from "@/lib/api"

import {
  useDeleteHousehold,
  useHouseholds,
  useServerSettings,
  useUpdateServerSettings,
} from "./use-server"

const DOLLARS = new Intl.NumberFormat(undefined, {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

/** Server admin: who can sign up, and the households on this server. */
export function ServerCard() {
  const settings = useServerSettings()
  const update = useUpdateServerSettings()
  const households = useHouseholds()

  return (
    <Card>
      <CardHeader>
        <CardTitle>This server</CardTitle>
        <CardDescription>
          You run this Nourvio. Each household has its own recipes and plans;
          they all use the AI keys below.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <FieldGroup>
          <Field orientation="horizontal">
            <Checkbox
              id="signup-open"
              checked={settings.data?.signupOpen ?? false}
              disabled={!settings.data || update.isPending}
              onCheckedChange={(on) =>
                update.mutate(
                  { signupOpen: on === true },
                  {
                    onSuccess: ({ signupOpen }) =>
                      toast.success(
                        signupOpen ? "Sign-up is on" : "Sign-up is off"
                      ),
                  }
                )
              }
            />
            <div className="grid gap-1">
              <FieldLabel htmlFor="signup-open">
                Let anyone create an account
              </FieldLabel>
              <FieldDescription>
                Each sign-up starts its own household. With the public link
                turned on, that's anyone on the internet who finds it, so leave
                this off and use invite links unless you need it.
              </FieldDescription>
            </div>
          </Field>

          <FieldSet>
            <FieldLegend variant="label">Households</FieldLegend>
            {households.isPending ? (
              <Skeleton className="h-16" />
            ) : households.isError ? (
              <FieldDescription>Couldn't load the households.</FieldDescription>
            ) : (
              <ItemGroup className="gap-2">
                {households.data.map((household) => (
                  <HouseholdRow key={household.id} household={household} />
                ))}
              </ItemGroup>
            )}
          </FieldSet>
        </FieldGroup>
      </CardContent>
    </Card>
  )
}

function HouseholdRow({ household }: { household: HouseholdSummary }) {
  const [deleting, setDeleting] = React.useState(false)
  const remove = useDeleteHousehold()
  const plural = (n: number, word: string) =>
    `${n} ${word}${n === 1 ? "" : "s"}`

  return (
    <Item variant="outline" size="sm">
      <ItemContent>
        <ItemTitle>
          {household.name}
          {household.isYours && <Badge variant="secondary">yours</Badge>}
        </ItemTitle>
        <ItemDescription>
          {[
            plural(household.members, "person"),
            plural(household.recipes, "recipe"),
            household.aiRequests > 0
              ? `${plural(household.aiRequests, "AI request")} this month${
                  household.aiCostUsd !== null
                    ? ` (about ${DOLLARS.format(household.aiCostUsd)})`
                    : ""
                }`
              : "no AI use this month",
          ].join(" · ")}
        </ItemDescription>
      </ItemContent>
      {!household.isYours && (
        <ItemActions>
          <Button size="sm" variant="ghost" onClick={() => setDeleting(true)}>
            Delete
          </Button>
        </ItemActions>
      )}
      <AlertDialog open={deleting} onOpenChange={setDeleting}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {household.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes its {plural(household.members, "account")} and{" "}
              {plural(household.recipes, "recipe")}, photos included. It can't
              be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() =>
                remove.mutate(household.id, {
                  onSuccess: () => toast.success(`${household.name} deleted`),
                  onError: (error) =>
                    toast.error(
                      error instanceof ApiError
                        ? error.message
                        : "Couldn't delete it"
                    ),
                })
              }
            >
              Delete household
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Item>
  )
}
