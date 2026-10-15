import * as React from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Alert02Icon,
  ArrowLeft01Icon,
  MinusSignIcon,
  PlusSignIcon,
  ShoppingCart01Icon,
} from "@hugeicons/core-free-icons"
import {
  lineCost,
  storeImageUrl,
  type BasketLine,
  type StoreProduct,
} from "@mise/shared"
import { Link } from "react-router"
import { toast } from "sonner"

import { PageHeader } from "@/components/layout/page-header"
import { Panel, WithAside } from "@/components/layout/page-layout"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { ApiError } from "@/lib/api"
import { cn } from "@/lib/utils"

import { saleThrough } from "./sale-text"
import {
  useBasket,
  usePickProduct,
  useSendBasket,
  useShopStatus,
  useStoreSearch,
} from "./use-shop"

const money = (value: number) =>
  value.toLocaleString(undefined, { style: "currency", currency: "USD" })

/** The list matched to the household's Kroger-family store, checked over, then sent to the cart. */
export function ShopPage() {
  const status = useShopStatus()
  const kroger = status.data?.kroger
  const ready = Boolean(kroger?.ready && kroger.store)
  const basket = useBasket(ready)
  const send = useSendBasket()
  const [packages, setPackages] = React.useState<Record<string, number>>({})
  const [left, setLeft] = React.useState<Record<string, boolean>>({})
  const [picking, setPicking] = React.useState<BasketLine | null>(null)
  const [done, setDone] = React.useState<{
    sent: number
    cartUrl: string
  } | null>(null)

  const store = kroger?.store?.banner ?? "the store"
  const lines = basket.data?.lines ?? []
  // Sent before, or nothing to send: left out unless ticked.
  const included = (line: BasketLine) =>
    Boolean(line.product) && (left[line.itemId] ?? !line.sent)
  const count = (line: BasketLine) => packages[line.itemId] ?? line.packages
  const chosen = lines.filter(included)
  const total = chosen.reduce(
    (sum, line) =>
      sum + (lineCost({ product: line.product, packages: count(line) }) ?? 0),
    0
  )
  const saved = chosen.reduce((sum, line) => {
    const { price, salePrice } = line.product ?? {}
    return price && salePrice ? sum + (price - salePrice) * count(line) : sum
  }, 0)
  const toCheck = chosen.filter((line) => line.suggested || !line.sure).length

  function submit() {
    send.mutate(
      {
        lines: chosen.map((line) => ({
          itemId: line.itemId,
          packages: count(line),
        })),
      },
      {
        onSuccess: (result) => {
          setDone(result)
          setLeft({})
          setPackages({})
          toast.success(
            `Added ${result.sent} ${result.sent === 1 ? "thing" : "things"} to your ${result.storeName} cart`
          )
        },
        onError: (error) =>
          toast.error(
            error instanceof ApiError ? error.message : "Couldn't send that"
          ),
      }
    )
  }

  const back = (
    <Link
      to="/list"
      className="mt-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
    >
      <HugeiconsIcon
        icon={ArrowLeft01Icon}
        strokeWidth={2}
        className="size-4"
      />
      List
    </Link>
  )

  if (status.isPending) return <Skeleton className="mt-8 h-64 rounded-3xl" />
  if (!ready) {
    return (
      <>
        {back}
        <Empty className="mt-6 border border-dashed">
          <EmptyHeader>
            <EmptyTitle>Connect your store first</EmptyTitle>
            <EmptyDescription>
              Pick your Fry's (or other Kroger) store in Settings, and Mise will
              match the list to its products and prices.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button asChild>
              <Link to="/settings#connections">Open Settings</Link>
            </Button>
          </EmptyContent>
        </Empty>
      </>
    )
  }

  return (
    <>
      {back}
      <PageHeader
        title={`Send to ${store}`}
        description={`${kroger!.store!.name} · ${kroger!.modality === "PICKUP" ? "Pickup" : "Delivery"}. Check the products and amounts, then add them to your cart.`}
      />
      {basket.isPending ? (
        <div className="grid gap-3">
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Spinner /> Finding each item at {store}…
          </p>
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-20 rounded-2xl" />
          ))}
        </div>
      ) : basket.isError ? (
        <p className="text-muted-foreground">
          {basket.error instanceof ApiError
            ? basket.error.message
            : "Couldn't reach the store just now."}
        </p>
      ) : !lines.length ? (
        <Empty className="border border-dashed">
          <EmptyHeader>
            <EmptyTitle>Nothing left to get</EmptyTitle>
            <EmptyDescription>
              Everything on the list is checked off.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <WithAside
          aside={
            <Panel title={done ? "Sent" : "Your cart"}>
              {done ? (
                <>
                  <p className="text-sm">
                    {done.sent} {done.sent === 1 ? "thing is" : "things are"} in
                    your {store} cart. Pick a{" "}
                    {kroger!.modality === "PICKUP" ? "pickup" : "delivery"} time
                    and check out in the {store} app or website.
                  </p>
                  <Button asChild className="justify-self-start">
                    <a href={done.cartUrl} target="_blank" rel="noreferrer">
                      Open your {store} cart
                    </a>
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="justify-self-start"
                    asChild
                  >
                    <Link to="/list">Back to the list</Link>
                  </Button>
                </>
              ) : (
                <>
                  <div>
                    <p className="font-heading text-3xl font-semibold">
                      {money(total)}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      For {chosen.length}{" "}
                      {chosen.length === 1 ? "thing" : "things"}, before tax.
                      {saved > 0 && ` Sales take off ${money(saved)}.`}
                    </p>
                  </div>
                  {toCheck > 0 && (
                    <p className="text-sm text-muted-foreground">
                      {toCheck} {toCheck === 1 ? "pick is" : "picks are"} Mise's
                      guess. Worth a quick look.
                    </p>
                  )}
                  {kroger!.linked ? (
                    <Button
                      disabled={!chosen.length || send.isPending}
                      onClick={submit}
                    >
                      {send.isPending ? (
                        <Spinner data-icon="inline-start" />
                      ) : (
                        <HugeiconsIcon
                          icon={ShoppingCart01Icon}
                          strokeWidth={2}
                          data-icon="inline-start"
                        />
                      )}
                      Add to {store} cart
                    </Button>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      {kroger!.needsRelink
                        ? "The account needs linking again"
                        : `Link the ${store} account`}{" "}
                      in{" "}
                      <Link
                        to="/settings#connections"
                        className="font-medium text-foreground underline underline-offset-4"
                      >
                        Settings
                      </Link>{" "}
                      to send this.
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Prices are {store}'s today, before tax. Mise can add to the
                    cart but not take things out, so look it over there too.
                  </p>
                </>
              )}
            </Panel>
          }
        >
          {basket.data.sentAt && (
            <p className="text-sm text-muted-foreground">
              Last sent{" "}
              {new Date(basket.data.sentAt).toLocaleString(undefined, {
                weekday: "short",
                hour: "numeric",
                minute: "2-digit",
              })}
              . What went then is left out unless you tick it.
            </p>
          )}
          <ul className="grid gap-2">
            {lines.map((line) => (
              <BasketRow
                key={line.itemId}
                line={line}
                included={included(line)}
                packages={count(line)}
                onInclude={(value) =>
                  setLeft((current) => ({ ...current, [line.itemId]: value }))
                }
                onPackages={(value) =>
                  setPackages((current) => ({
                    ...current,
                    [line.itemId]: value,
                  }))
                }
                onPick={() => setPicking(line)}
                store={store}
              />
            ))}
          </ul>
          {!done && (
            // On phones the cart panel is far below; keep the total and Send in reach.
            <div className="sticky bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-20 flex items-center gap-3 rounded-2xl border bg-background/95 p-3 pr-[4.75rem] shadow-lg backdrop-blur md:bottom-4 lg:hidden">
              <div className="min-w-0 flex-1">
                <p className="font-semibold tabular-nums">{money(total)}</p>
                <p className="text-xs text-muted-foreground">
                  {chosen.length} {chosen.length === 1 ? "thing" : "things"}
                </p>
              </div>
              {kroger!.linked ? (
                <Button
                  disabled={!chosen.length || send.isPending}
                  onClick={submit}
                >
                  {send.isPending && <Spinner data-icon="inline-start" />}
                  Add to cart
                </Button>
              ) : (
                <Button variant="outline" asChild>
                  <Link to="/settings#connections">Link account</Link>
                </Button>
              )}
            </div>
          )}
        </WithAside>
      )}
      <ProductPicker
        line={picking}
        store={store}
        onClose={() => setPicking(null)}
      />
    </>
  )
}

function BasketRow({
  line,
  included,
  packages,
  onInclude,
  onPackages,
  onPick,
  store,
}: {
  line: BasketLine
  included: boolean
  packages: number
  onInclude: (value: boolean) => void
  onPackages: (value: number) => void
  onPick: () => void
  store: string
}) {
  const product = line.product
  const cost = lineCost({ product, packages })
  return (
    <li
      className={cn(
        "flex flex-wrap items-center gap-3 rounded-2xl border bg-card p-3 text-card-foreground sm:flex-nowrap",
        !included && "opacity-70"
      )}
    >
      <Checkbox
        checked={included}
        disabled={!product}
        onCheckedChange={(value) => onInclude(value === true)}
        aria-label={`Send ${line.name}`}
      />
      <ProductImage product={product} />
      <div className="min-w-0 flex-1 basis-48">
        <p className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">{line.name}</span>
          {line.amount && ` · ${line.amount}`}
        </p>
        {product ? (
          <p className="truncate text-sm">
            {product.name}
            {product.size && (
              <span className="text-muted-foreground"> · {product.size}</span>
            )}
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">
            No match at {store} yet
          </p>
        )}
        <div className="mt-1 flex flex-wrap gap-1">
          {line.suggested && <Badge variant="outline">Mise's pick</Badge>}
          {product?.salePrice && (
            <Badge variant="secondary">
              On sale
              {product.saleEnds && ` ${saleThrough(product.saleEnds)}`}
            </Badge>
          )}
          {product?.inStock === false && (
            <Badge variant="destructive">Out of stock</Badge>
          )}
          {product && !line.sure && (
            <Badge variant="outline" className="gap-1">
              <HugeiconsIcon
                icon={Alert02Icon}
                strokeWidth={2}
                className="size-3"
              />
              Check how many
            </Badge>
          )}
          {line.sent && <Badge variant="outline">Sent</Badge>}
          {product?.aisle && (
            <span className="text-xs text-muted-foreground">
              {product.aisle}
            </span>
          )}
        </div>
      </div>
      {product && (
        <div className="flex items-center gap-1" aria-label="How many">
          <Button
            variant="outline"
            size="icon-sm"
            aria-label="One fewer"
            disabled={packages <= 1}
            onClick={() => onPackages(packages - 1)}
          >
            <HugeiconsIcon icon={MinusSignIcon} strokeWidth={2} />
          </Button>
          <span className="w-6 text-center tabular-nums">{packages}</span>
          <Button
            variant="outline"
            size="icon-sm"
            aria-label="One more"
            disabled={packages >= 99}
            onClick={() => onPackages(packages + 1)}
          >
            <HugeiconsIcon icon={PlusSignIcon} strokeWidth={2} />
          </Button>
        </div>
      )}
      <div className="w-20 text-right text-sm tabular-nums">
        {cost !== null && <p className="font-medium">{money(cost)}</p>}
        {product?.salePrice && product.price && (
          <p className="text-xs text-muted-foreground line-through">
            {money(product.price * packages)}
          </p>
        )}
        {line.usual !== null && (
          <p className="text-xs text-muted-foreground">
            usually {money(line.usual)}
            {packages > 1 && " each"}
          </p>
        )}
      </div>
      <Button variant="ghost" size="sm" onClick={onPick}>
        {product ? "Change" : "Find it"}
      </Button>
    </li>
  )
}

function ProductImage({ product }: { product: StoreProduct | null }) {
  const src = storeImageUrl(product?.image ?? null)
  const [failed, setFailed] = React.useState<string | null>(null)
  return src && failed !== src ? (
    <img
      src={src}
      alt=""
      loading="lazy"
      onError={() => setFailed(src)}
      className="size-14 shrink-0 rounded-xl border bg-white object-contain"
    />
  ) : (
    <div className="size-14 shrink-0 rounded-xl border bg-muted" />
  )
}

/** Search the store and pick the product to buy for an item, from now on. */
function ProductPicker({
  line,
  store,
  onClose,
}: {
  line: BasketLine | null
  store: string
  onClose: () => void
}) {
  const [query, setQuery] = React.useState("")
  const [shown, setShown] = React.useState<string | null>(null)
  const results = useStoreSearch(query)
  const pick = usePickProduct()

  // A fresh search for each item opened.
  if (line && shown !== line.itemId) {
    setShown(line.itemId)
    setQuery(line.name)
  }

  return (
    <Dialog open={Boolean(line)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[85vh] grid-rows-[auto_auto_minmax(0,1fr)] sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{line?.name}</DialogTitle>
          <DialogDescription>
            Pick what to buy at {store}. Mise remembers it for next time.
          </DialogDescription>
        </DialogHeader>
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={`Search ${store}`}
          aria-label={`Search ${store}`}
          autoFocus
        />
        <div className="min-h-0 overflow-y-auto">
          {results.isFetching && !results.data ? (
            <div className="grid gap-2">
              {Array.from({ length: 4 }, (_, i) => (
                <Skeleton key={i} className="h-16 rounded-xl" />
              ))}
            </div>
          ) : results.data?.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Nothing at {store} for that. Try other words.
            </p>
          ) : (
            <ul
              className={cn("grid gap-1", results.isFetching && "opacity-60")}
            >
              {(results.data ?? []).map((product) => (
                <li key={product.id}>
                  <button
                    type="button"
                    disabled={pick.isPending}
                    onClick={() =>
                      line &&
                      pick.mutate(
                        { itemId: line.itemId, productId: product.id },
                        {
                          onSuccess: onClose,
                          onError: (error) =>
                            toast.error(
                              error instanceof ApiError
                                ? error.message
                                : "Couldn't pick that"
                            ),
                        }
                      )
                    }
                    className={cn(
                      "flex w-full items-center gap-3 rounded-xl p-2 text-left hover:bg-muted disabled:opacity-60",
                      line?.product?.id === product.id && "bg-muted"
                    )}
                  >
                    <ProductImage product={product} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">
                        {product.name}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {[product.size, product.aisle]
                          .filter(Boolean)
                          .join(" · ")}
                        {product.inStock === false && " · Out of stock"}
                      </span>
                    </span>
                    <span className="text-right text-sm tabular-nums">
                      {product.salePrice ? (
                        <>
                          <span className="block font-medium">
                            {money(product.salePrice)}
                          </span>
                          <span className="block text-xs text-muted-foreground line-through">
                            {money(product.price!)}
                          </span>
                        </>
                      ) : (
                        product.price !== null && money(product.price)
                      )}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
