import { Search01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import * as React from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group"
import { Spinner } from "@/components/ui/spinner"
import { api, ApiError, unwrap } from "@/lib/api/client"

import { ProductSummary } from "./product-summary"
import type { BasketLine, StoreProduct } from "./queries"

/**
 * Picks another product for a thing on the list: a search of the store,
 * and the pick is kept for next time.
 */
export function ProductSearchDialog({
  line,
  store,
  today,
  onOpenChange,
  onPicked,
}: {
  line: BasketLine | null
  store: string
  today: string
  onOpenChange: (open: boolean) => void
  onPicked: (line: BasketLine) => void
}) {
  const { t } = useTranslation()
  const [term, setTerm] = React.useState("")
  const [found, setFound] = React.useState<StoreProduct[] | null>(null)
  const [busy, setBusy] = React.useState<string | null>(null)

  // A fresh search for each thing.
  React.useEffect(() => {
    if (!line) return
    setTerm(line.name)
    setFound(null)
    void search(line.name)
  }, [line?.itemId])

  async function search(q: string) {
    if (q.trim().length < 2) return
    setBusy("search")
    try {
      const answer = await unwrap(
        api.GET("/api/stores/kroger/search", {
          params: { query: { q: q.trim() } },
        })
      )
      setFound(answer.products)
    } catch (err) {
      if (!(err instanceof ApiError)) throw err
      toast.error(err.message)
    } finally {
      setBusy(null)
    }
  }

  async function pick(product: StoreProduct) {
    if (!line) return
    setBusy(product.id)
    try {
      const picked = await unwrap(
        api.PUT("/api/stores/kroger/products/{itemId}", {
          params: { path: { itemId: line.itemId } },
          body: { productId: product.id },
        })
      )
      onPicked(picked)
      onOpenChange(false)
    } catch (err) {
      if (!(err instanceof ApiError)) throw err
      toast.error(err.message)
    } finally {
      setBusy(null)
    }
  }

  return (
    <Dialog open={line !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {t("stores.basket.pickTitle", { name: line?.name })}
          </DialogTitle>
          <DialogDescription>
            {t("stores.basket.pickHint", { store })}
          </DialogDescription>
        </DialogHeader>
        <form
          noValidate
          onSubmit={(event) => {
            event.preventDefault()
            void search(term)
          }}
        >
          <InputGroup>
            <InputGroupInput
              aria-label={t("stores.basket.search")}
              value={term}
              onChange={(event) => setTerm(event.target.value)}
            />
            <InputGroupAddon align="inline-end">
              <InputGroupButton
                type="submit"
                size="icon-xs"
                disabled={busy !== null || term.trim().length < 2}
                aria-label={t("stores.basket.search")}
              >
                {busy === "search" ? (
                  <Spinner />
                ) : (
                  <HugeiconsIcon icon={Search01Icon} strokeWidth={2} />
                )}
              </InputGroupButton>
            </InputGroupAddon>
          </InputGroup>
        </form>
        <div className="-mx-2 max-h-[60vh] overflow-y-auto px-2">
          {found && found.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">
              {t("stores.basket.nothingFound", { store })}
            </p>
          )}
          {found && found.length > 0 && (
            <ul className="grid gap-1">
              {found.map((product) => (
                <li key={product.id}>
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() => void pick(product)}
                    className="flex w-full items-center gap-3 rounded-xl p-2 text-left transition-colors hover:bg-muted disabled:opacity-60"
                  >
                    <ProductSummary product={product} today={today} />
                    {busy === product.id && <Spinner />}
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
