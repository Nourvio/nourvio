import {
  Alert02Icon,
  ArrowLeft01Icon,
  MinusSignIcon,
  PlusSignIcon,
  ShoppingCart01Icon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { priceNow } from "@merran/shared"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import * as React from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import { PageHeader } from "@/components/layout/page-header"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { useActiveHousehold } from "@/features/auth/use-me"
import { isAdminRole } from "@/features/household/queries"
import { useHouseholdClock } from "@/features/plan/queries"
import { api, ApiError, unwrap } from "@/lib/api/client"
import { formatRelativeDate } from "@/lib/format"
import { cn } from "@/lib/utils"

import { ProductSearchDialog } from "./product-search-dialog"
import { ProductSummary } from "./product-summary"
import {
  formatPrice,
  krogerBasketQuery,
  type Basket,
  type BasketLine,
} from "./queries"

/**
 * The list at the household's Kroger store: a product for each thing and
 * how many, to look over before it goes to the linked account's cart.
 * Kroger only lets Merran add to the cart; checking out is on its site.
 */
export function KrogerBasketPage() {
  const { t } = useTranslation()
  const basket = useQuery(krogerBasketQuery)

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className="mt-2 -ml-3 self-start md:mt-4"
        render={<Link to="/list" />}
      >
        <HugeiconsIcon icon={ArrowLeft01Icon} strokeWidth={2} />
        {t("nav.list")}
      </Button>
      {basket.data ? (
        // Afresh after each send: what went is left out next time.
        <Review key={basket.data.sentAt ?? ""} basket={basket.data} />
      ) : basket.isPending ? (
        <>
          <PageHeader
            title={t("stores.basket.loadingTitle")}
            description={t("stores.basket.loading")}
          />
          <div className="grid gap-3">
            {Array.from({ length: 5 }, (_, i) => (
              <Skeleton key={i} className="h-20 rounded-2xl" />
            ))}
          </div>
        </>
      ) : (
        <>
          <PageHeader title={t("stores.basket.failedTitle")} />
          <div className="grid justify-items-start gap-3">
            <p className="text-muted-foreground">
              {basket.error instanceof ApiError
                ? basket.error.message
                : t("status.error.description")}
            </p>
            <Button variant="outline" onClick={() => void basket.refetch()}>
              {t("stores.basket.again")}
            </Button>
          </div>
        </>
      )}
    </>
  )
}

function Review({ basket }: { basket: Basket }) {
  const { t, i18n } = useTranslation()
  const queryClient = useQueryClient()
  const { today } = useHouseholdClock()
  const admin = isAdminRole(useActiveHousehold()?.role)
  // Left out to begin with: what's out of stock, and what went last time,
  // so nothing goes to the cart twice.
  const [left, setLeft] = React.useState<Set<string>>(
    () =>
      new Set(
        basket.lines
          .filter((line) => !line.product || !line.product.inStock || line.sent)
          .map((line) => line.itemId)
      )
  )
  const [counts, setCounts] = React.useState<Record<string, number>>({})
  const [picking, setPicking] = React.useState<BasketLine | null>(null)
  const [sending, setSending] = React.useState(false)

  const packagesOf = (line: BasketLine) => counts[line.itemId] ?? line.packages
  const going = basket.lines.filter(
    (line) => line.product && !left.has(line.itemId)
  )
  const total = going.reduce((sum, line) => {
    const price = priceNow(line.product!, today).price
    return price === null ? sum : sum + price * packagesOf(line)
  }, 0)
  const unpriced = going.some(
    (line) => priceNow(line.product!, today).price === null
  )
  const currency = going[0]?.product?.currency ?? "USD"
  const where =
    basket.modality === "DELIVERY"
      ? t("stores.basket.delivery")
      : t("stores.basket.pickup")

  function toggle(itemId: string, on: boolean) {
    setLeft((was) => {
      const next = new Set(was)
      if (on) next.delete(itemId)
      else next.add(itemId)
      return next
    })
  }

  function picked(line: BasketLine) {
    queryClient.setQueryData(krogerBasketQuery.queryKey, (was) =>
      was
        ? {
            ...was,
            lines: was.lines.map((old) =>
              old.itemId === line.itemId ? line : old
            ),
          }
        : was
    )
    setCounts(({ [line.itemId]: _, ...rest }) => rest)
    toggle(line.itemId, true)
  }

  async function send() {
    setSending(true)
    try {
      const sent = await unwrap(
        api.POST("/api/stores/kroger/send", {
          body: {
            lines: going.map((line) => ({
              itemId: line.itemId,
              packages: packagesOf(line),
            })),
          },
        })
      )
      toast.success(
        t("stores.basket.sent", { count: sent.sent, store: sent.store }),
        {
          action: {
            label: t("stores.basket.openCart"),
            onClick: () =>
              window.open(sent.cartUrl, "_blank", "noopener,noreferrer"),
          },
        }
      )
      await queryClient.invalidateQueries({
        queryKey: krogerBasketQuery.queryKey,
      })
    } catch (err) {
      if (!(err instanceof ApiError)) throw err
      toast.error(err.message)
    } finally {
      setSending(false)
    }
  }

  return (
    <>
      <PageHeader
        title={t("stores.basket.title", { store: basket.store })}
        description={t("stores.basket.description", {
          location: basket.location.name,
          where,
        })}
        actions={
          <Button
            disabled={!basket.linked || going.length === 0 || sending}
            onClick={() => void send()}
          >
            {sending ? (
              <Spinner />
            ) : (
              <HugeiconsIcon
                icon={ShoppingCart01Icon}
                strokeWidth={2}
                data-icon="inline-start"
              />
            )}
            {t("stores.basket.send", { count: going.length })}
          </Button>
        }
      />

      <div className="grid gap-4 pb-24">
        {!basket.linked && (
          <Alert>
            <HugeiconsIcon icon={Alert02Icon} strokeWidth={2} />
            <AlertTitle>
              {t("stores.basket.notLinked", { store: basket.store })}
            </AlertTitle>
            <AlertDescription>
              {admin
                ? t("stores.basket.linkHint")
                : t("stores.basket.askAdmin")}
              {admin && (
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-2"
                  render={<Link to="/settings/household" />}
                >
                  {t("stores.basket.linkNow")}
                </Button>
              )}
            </AlertDescription>
          </Alert>
        )}
        {basket.sentAt && (
          <p className="text-sm text-muted-foreground">
            {t("stores.basket.sentBefore", {
              when: formatRelativeDate(basket.sentAt, i18n.language),
            })}
          </p>
        )}

        {basket.lines.length === 0 ? (
          <p className="rounded-2xl border border-dashed p-8 text-center text-muted-foreground">
            {t("stores.basket.empty")}
          </p>
        ) : (
          <ul className="grid gap-2">
            {basket.lines.map((line) => (
              <Line
                key={line.itemId}
                line={line}
                today={today}
                on={Boolean(line.product) && !left.has(line.itemId)}
                packages={packagesOf(line)}
                onToggle={(on) => toggle(line.itemId, on)}
                onPackages={(packages) =>
                  setCounts((was) => ({ ...was, [line.itemId]: packages }))
                }
                onChange={() => setPicking(line)}
              />
            ))}
          </ul>
        )}

        {going.length > 0 && (
          <div className="flex items-baseline justify-between gap-3 rounded-2xl border bg-muted/40 p-4">
            <span className="text-sm text-muted-foreground">
              {unpriced
                ? t("stores.basket.totalSome")
                : t("stores.basket.total")}
            </span>
            <span className="text-lg font-semibold tabular-nums">
              {formatPrice(total, currency, i18n.language)}
            </span>
          </div>
        )}
      </div>

      <ProductSearchDialog
        line={picking}
        store={basket.store}
        today={today}
        onOpenChange={(open) => !open && setPicking(null)}
        onPicked={picked}
      />
    </>
  )
}

function Line({
  line,
  today,
  on,
  packages,
  onToggle,
  onPackages,
  onChange,
}: {
  line: BasketLine
  today: string
  on: boolean
  packages: number
  onToggle: (on: boolean) => void
  onPackages: (packages: number) => void
  onChange: () => void
}) {
  const { t, i18n } = useTranslation()
  const id = React.useId()
  const product = line.product
  const saleEnds =
    product && priceNow(product, today).onSale ? product.saleEnds : null
  // "Usually $4.49", when that's not the regular price already shown.
  const usual =
    product && line.sale?.usual && line.sale.usual !== product.price
      ? formatPrice(line.sale.usual, product.currency, i18n.language)
      : null

  return (
    <li
      className={cn(
        "grid gap-3 rounded-2xl border p-3 transition-opacity sm:p-4",
        !on && "opacity-60"
      )}
    >
      <div className="flex items-center gap-3">
        <Checkbox
          id={id}
          checked={on}
          disabled={!product}
          onCheckedChange={(checked) => onToggle(checked === true)}
          aria-label={t("stores.basket.include", { name: line.name })}
        />
        {product ? (
          <ProductSummary product={product} today={today} packages={packages} />
        ) : (
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">{line.name}</p>
            <p className="text-xs text-muted-foreground">
              {t("stores.basket.noneFound")}
            </p>
          </div>
        )}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 sm:pl-8">
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <span className="truncate text-xs text-muted-foreground">
            {t("stores.basket.forItem", {
              item: [line.amount, line.name].filter(Boolean).join(" "),
            })}
          </span>
          {line.suggested && product && (
            <Badge variant="secondary">{t("stores.basket.merransPick")}</Badge>
          )}
          {product && !line.sure && (
            <Badge variant="outline">{t("stores.basket.checkHowMany")}</Badge>
          )}
          {line.sale?.verdict === "lowest" && (
            <Badge>{t("stores.basket.lowest")}</Badge>
          )}
          {line.sale?.verdict === "small" && (
            <Badge variant="outline">{t("stores.basket.barelyOff")}</Badge>
          )}
          {usual && (
            <span className="text-xs text-muted-foreground">
              {t("stores.basket.usually", { price: usual })}
            </span>
          )}
          {saleEnds && (
            <Badge variant="outline">
              {t("stores.basket.saleUntil", { date: saleEnds })}
            </Badge>
          )}
          {line.sent && (
            <Badge variant="outline">{t("stores.basket.sentBadge")}</Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          {product && (
            <div className="flex items-center rounded-lg border">
              <Button
                variant="ghost"
                size="icon-sm"
                disabled={!on || packages <= 1}
                onClick={() => onPackages(packages - 1)}
                aria-label={t("stores.basket.fewer")}
              >
                <HugeiconsIcon icon={MinusSignIcon} strokeWidth={2} />
              </Button>
              <span className="w-7 text-center text-sm tabular-nums">
                {packages}
              </span>
              <Button
                variant="ghost"
                size="icon-sm"
                disabled={!on || packages >= 99}
                onClick={() => onPackages(packages + 1)}
                aria-label={t("stores.basket.more")}
              >
                <HugeiconsIcon icon={PlusSignIcon} strokeWidth={2} />
              </Button>
            </div>
          )}
          <Button variant="outline" size="sm" onClick={onChange}>
            {product ? t("stores.basket.change") : t("stores.basket.find")}
          </Button>
        </div>
      </div>
    </li>
  )
}
