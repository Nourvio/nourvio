import * as React from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import { Alert02Icon, Store01Icon } from "@hugeicons/core-free-icons"
import type { KrogerModality, ShopStatus } from "@mise/shared"
import { useSearchParams } from "react-router"
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
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { useCurrentUser } from "@/features/auth/current-user"
import { ApiError } from "@/lib/api"

import {
  useCheckPrices,
  useKrogerStores,
  useLinkKroger,
  useSaveKrogerSettings,
  useShopStatus,
  useUnlinkKroger,
} from "./use-shop"

/** The household's stores: Fry's (Kroger) to fill the cart, and how Costco and Walmart work. */
export function StoresCard() {
  const status = useShopStatus()
  const me = useCurrentUser()
  const admin = me.role === "admin"
  useLinkResult()

  return (
    <Card>
      <CardHeader>
        <CardTitle>Stores</CardTitle>
        <CardDescription>
          Send the shopping list to your store. Mise never touches payment: you
          check out in the store's own app.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-5">
        {status.isPending ? (
          <Skeleton className="h-28" />
        ) : !status.data ? (
          <p className="text-sm text-muted-foreground">
            Couldn't load the stores.
          </p>
        ) : (
          <KrogerSection
            kroger={status.data.kroger}
            admin={admin}
            serverAdmin={me.isServerAdmin}
          />
        )}
        <Separator />
        <div className="grid gap-1">
          <h3 className="font-medium">Costco</h3>
          <p className="text-sm text-muted-foreground">
            No account needed. Costco has no way for apps to fill a cart, so the
            list links each item to Costco Same-Day to add yourself.
          </p>
        </div>
        <div className="grid gap-1">
          <h3 className="font-medium">Walmart</h3>
          <p className="text-sm text-muted-foreground">
            Coming with the Mise browser extension, which fills your Walmart
            cart from your own signed-in tab.
          </p>
        </div>
      </CardContent>
    </Card>
  )
}

/** "Today at 6:02 AM", "Yesterday at 6:01 AM", or "Oct 12". */
function checkedWhen(iso: string) {
  const at = new Date(iso)
  const days = Math.round(
    (new Date().setHours(0, 0, 0, 0) - new Date(iso).setHours(0, 0, 0, 0)) /
      86_400_000
  )
  const time = at.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  })
  if (days === 0) return `today at ${time}`
  if (days === 1) return `yesterday at ${time}`
  return at.toLocaleDateString(undefined, { month: "short", day: "numeric" })
}

/** When the store's prices and sales were last checked, and a way to check now. */
function PricesRow({ kroger }: { kroger: ShopStatus["kroger"] }) {
  const check = useCheckPrices()
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm text-muted-foreground">
        Prices and sales are checked each morning
        {kroger.pricesCheckedAt
          ? `, last ${checkedWhen(kroger.pricesCheckedAt)}.`
          : "."}
      </p>
      <Button
        variant="outline"
        size="sm"
        disabled={check.isPending}
        onClick={() =>
          check.mutate(undefined, {
            onSuccess: (result) =>
              toast.success(
                result.onSale
                  ? `${result.onSale} ${result.onSale === 1 ? "food" : "foods"} in your recipes on sale`
                  : "Nothing in your recipes is on sale right now"
              ),
            onError: (error) =>
              toast.error(
                error instanceof ApiError
                  ? error.message
                  : "Couldn't check prices"
              ),
          })
        }
      >
        {check.isPending && <Spinner data-icon="inline-start" />}
        Check now
      </Button>
    </div>
  )
}

/** Kroger sends people back to Settings with how linking went. */
function useLinkResult() {
  const [params, setParams] = useSearchParams()
  const result = params.get("kroger")
  const reason = params.get("reason")
  React.useEffect(() => {
    if (!result) return
    if (result === "linked") toast.success("Your Kroger account is linked")
    else if (result === "failed") {
      toast.error(reason ?? "Linking the Kroger account didn't work")
    }
    setParams(
      (current) => {
        current.delete("kroger")
        current.delete("reason")
        return current
      },
      { replace: true }
    )
    // Back on this card, once the page has drawn.
    window.setTimeout(
      () => document.getElementById("connections")?.scrollIntoView(),
      150
    )
  }, [result, reason, setParams])
}

function KrogerSection({
  kroger,
  admin,
  serverAdmin,
}: {
  kroger: ShopStatus["kroger"]
  admin: boolean
  serverAdmin: boolean
}) {
  const save = useSaveKrogerSettings()
  const link = useLinkKroger()
  const unlink = useUnlinkKroger()
  const [choosing, setChoosing] = React.useState(false)
  const name = kroger.store?.banner ?? "Fry's and other Kroger stores"

  const fail = (error: unknown) =>
    toast.error(error instanceof ApiError ? error.message : "That didn't work")

  if (!kroger.ready) {
    return (
      <div className="grid gap-1">
        <h3 className="font-medium">Fry's and other Kroger stores</h3>
        <p className="text-sm text-muted-foreground">
          {serverAdmin ? (
            <>
              Set up the Kroger app in{" "}
              <a
                href="#kroger"
                className="font-medium text-foreground underline underline-offset-4"
              >
                Kroger, under This server
              </a>{" "}
              first.
            </>
          ) : (
            "Not set up on this server yet. The server admin can turn it on."
          )}
        </p>
      </div>
    )
  }

  return (
    <div className="grid gap-4">
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-accent text-accent-foreground">
          <HugeiconsIcon icon={Store01Icon} strokeWidth={2} />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="font-medium">{name}</h3>
          {kroger.store ? (
            <p className="text-sm text-muted-foreground">
              {kroger.store.name} · {kroger.store.address}
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              Pick your store to see its prices and aisles.
            </p>
          )}
        </div>
        {admin && kroger.store && !choosing && (
          <Button variant="outline" size="sm" onClick={() => setChoosing(true)}>
            Change
          </Button>
        )}
      </div>

      {admin && (choosing || !kroger.store) && (
        <StorePicker
          saving={save.isPending}
          onPick={(locationId) =>
            save.mutate(
              { locationId },
              {
                onSuccess: () => setChoosing(false),
                onError: fail,
              }
            )
          }
          onCancel={kroger.store ? () => setChoosing(false) : undefined}
        />
      )}

      {kroger.store && (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm text-muted-foreground">
              Orders are for
            </span>
            <ToggleGroup
              type="single"
              variant="outline"
              size="sm"
              value={kroger.modality}
              disabled={!admin || save.isPending}
              onValueChange={(value) =>
                value &&
                save.mutate(
                  { modality: value as KrogerModality },
                  { onError: fail }
                )
              }
            >
              <ToggleGroupItem value="PICKUP">Pickup</ToggleGroupItem>
              <ToggleGroupItem value="DELIVERY">Delivery</ToggleGroupItem>
            </ToggleGroup>
          </div>

          <PricesRow kroger={kroger} />

          {kroger.needsRelink && (
            <p className="flex items-center gap-2 text-sm text-destructive">
              <HugeiconsIcon
                icon={Alert02Icon}
                strokeWidth={2}
                className="size-4"
              />
              {kroger.store.banner} stopped accepting the sign-in. Link the
              account again.
            </p>
          )}

          {kroger.linked ? (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Badge variant="secondary">Linked</Badge>
              <span className="text-muted-foreground">
                {kroger.linked.by}'s {kroger.store.banner} account, since{" "}
                {new Date(kroger.linked.at).toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                })}
              </span>
              {admin && (
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={unlink.isPending}
                  onClick={() => unlink.mutate(undefined, { onError: fail })}
                >
                  Unlink
                </Button>
              )}
            </div>
          ) : admin ? (
            <div className="grid gap-2">
              <Button
                className="justify-self-start"
                disabled={link.isPending}
                onClick={() => link.mutate(undefined, { onError: fail })}
              >
                {link.isPending && <Spinner data-icon="inline-start" />}
                Link the {kroger.store.banner} account
              </Button>
              <p className="text-xs text-muted-foreground">
                You sign in on {kroger.store.banner}'s own page. Mise can only
                add to that account's cart; it can't see orders or pay.
              </p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              A household admin can link the {kroger.store.banner} account.
            </p>
          )}
        </>
      )}
    </div>
  )
}

function StorePicker({
  saving,
  onPick,
  onCancel,
}: {
  saving: boolean
  onPick: (locationId: string) => void
  onCancel?: () => void
}) {
  const [zip, setZip] = React.useState("")
  const stores = useKrogerStores(zip)
  return (
    <div className="grid gap-3 rounded-2xl border p-4">
      <div className="flex items-center gap-2">
        <Input
          value={zip}
          onChange={(event) =>
            setZip(event.target.value.replace(/\D/g, "").slice(0, 5))
          }
          placeholder="ZIP code"
          inputMode="numeric"
          aria-label="ZIP code"
          className="max-w-36"
        />
        {stores.isFetching && <Spinner />}
        {onCancel && (
          <Button variant="ghost" size="sm" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>
      {stores.isError && (
        <p className="text-sm text-destructive">
          {stores.error instanceof ApiError
            ? stores.error.message
            : "Couldn't find stores"}
        </p>
      )}
      {stores.data?.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No Kroger-family stores near there.
        </p>
      )}
      {stores.data && stores.data.length > 0 && (
        <ul className="grid gap-1">
          {stores.data.map((store) => (
            <li key={store.locationId}>
              <button
                type="button"
                disabled={saving}
                onClick={() => onPick(store.locationId)}
                className="w-full rounded-xl px-3 py-2 text-left text-sm hover:bg-muted disabled:opacity-60"
              >
                <span className="font-medium">{store.name}</span>
                <span className="block text-muted-foreground">
                  {store.address}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
