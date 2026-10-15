import { useCallback, useEffect, useState } from "react"
import {
  lineCost,
  type Basket,
  type BasketLine,
  type StoreProduct,
} from "@mise/shared"

import { mise, MiseError } from "./mise.ts"
import { WALMART, WALMART_ORIGINS } from "./walmart.ts"
import type { WalmartJob } from "./walmart-jobs.ts"

const money = (value: number) =>
  value.toLocaleString(undefined, { style: "currency", currency: "USD" })

/**
 * Filling the Walmart cart from the list: each item's Walmart product
 * (found in your Walmart tab, picked by Nourvio or by you, then remembered),
 * how many, and a button that adds them on Walmart's own pages.
 */
export function WalmartView() {
  const [basket, setBasket] = useState<Basket | null>(null)
  const [job, setJob] = useState<WalmartJob | null>(null)
  const [packages, setPackages] = useState<Record<string, number>>({})
  const [left, setLeft] = useState<Record<string, boolean>>({})
  const [picking, setPicking] = useState<string | null>(null)
  const [error, setError] = useState<string>()

  const load = useCallback(
    () =>
      mise<{ basket: Basket }>("/shop/walmart/basket").then(
        ({ basket }) => {
          setBasket(basket)
          setError(undefined)
        },
        (e) =>
          setError(
            e instanceof MiseError ? e.message : "Couldn't load the list."
          )
      ),
    []
  )

  useEffect(() => {
    void load()
    void chrome.storage.session.get("walmartJob").then(({ walmartJob }) => {
      setJob((walmartJob as WalmartJob | undefined) ?? null)
    })
    const onChange = (
      changes: Record<string, chrome.storage.StorageChange>
    ) => {
      if (!("walmartJob" in changes)) return
      const next =
        (changes.walmartJob.newValue as WalmartJob | undefined) ?? null
      setJob(next)
      if (next && !next.running) void load()
    }
    chrome.storage.session.onChanged.addListener(onChange)
    return () => chrome.storage.session.onChanged.removeListener(onChange)
  }, [load])

  /** The browser asks once to let the extension work on walmart.com. Must run first in a click. */
  const allowWalmart = () =>
    chrome.permissions.request({ origins: WALMART_ORIGINS })

  async function find(lines: BasketLine[], suggest: boolean) {
    if (!(await allowWalmart())) {
      setError("The extension needs walmart.com to search there.")
      return
    }
    await chrome.runtime.sendMessage({
      type: "walmart-search",
      request: {
        items: lines.map((line) => ({ itemId: line.itemId, name: line.name })),
        suggest,
      },
    })
  }

  async function change(line: BasketLine) {
    setPicking(line.itemId)
    // Search again unless the last search has its results.
    if (!job?.results[line.itemId]?.length) await find([line], false)
  }

  async function pick(line: BasketLine, product: StoreProduct) {
    try {
      const { line: updated } = await mise<{ line: BasketLine }>(
        `/shop/walmart/products/${line.itemId}`,
        { method: "PUT", body: { product } }
      )
      setBasket(
        (current) =>
          current && {
            ...current,
            lines: current.lines.map((l) =>
              l.itemId === updated.itemId ? updated : l
            ),
          }
      )
      setPicking(null)
    } catch (e) {
      setError(e instanceof MiseError ? e.message : "Couldn't save that.")
    }
  }

  const lines = basket?.lines ?? []
  const included = (line: BasketLine) =>
    Boolean(line.product) && (left[line.itemId] ?? !line.sent)
  const count = (line: BasketLine) => packages[line.itemId] ?? line.packages
  const chosen = lines.filter(included)
  const missing = lines.filter((line) => !line.product)
  const total = chosen.reduce(
    (sum, line) =>
      sum + (lineCost({ product: line.product, packages: count(line) }) ?? 0),
    0
  )
  const busy = Boolean(job?.running)

  async function fill() {
    if (!(await allowWalmart())) {
      setError("The extension needs walmart.com to fill the cart.")
      return
    }
    setLeft({})
    await chrome.runtime.sendMessage({
      type: "walmart-fill",
      request: {
        lines: chosen.map((line) => ({
          itemId: line.itemId,
          productId: line.product!.id,
          name: line.product!.name,
          quantity: count(line),
        })),
      },
    })
  }

  return (
    <>
      <div className="stack" style={{ paddingTop: 0 }}>
        {error && <p className="error">{error}</p>}
        {job && (job.running || job.stopped || job.kind === "fill") && (
          <JobCard job={job} />
        )}
        {basket === null ? (
          !error && <p className="muted">Loading…</p>
        ) : !lines.length ? (
          <p className="muted">Nothing left to get.</p>
        ) : (
          <>
            {missing.length > 0 && (
              <div className="card">
                <p>
                  {missing.length}{" "}
                  {missing.length === 1 ? "item has" : "items have"} no Walmart
                  product yet.
                </p>
                <button
                  disabled={busy}
                  onClick={() => void find(missing, true)}
                >
                  Find {missing.length === 1 ? "it" : "them"} on Walmart
                </button>
                <p className="muted">
                  Nourvio searches in a Walmart tab, a few seconds apart, and
                  picks the likeliest; you can change any of them.
                </p>
              </div>
            )}
            <div className="items" style={{ display: "block" }}>
              {lines.map((line) => (
                <Line
                  key={line.itemId}
                  line={line}
                  included={included(line)}
                  packages={count(line)}
                  busy={busy}
                  picking={picking === line.itemId}
                  results={job?.results[line.itemId] ?? null}
                  searching={
                    busy && job?.kind === "search" && job.current === line.name
                  }
                  onInclude={(value) =>
                    setLeft((current) => ({ ...current, [line.itemId]: value }))
                  }
                  onPackages={(value) =>
                    setPackages((current) => ({
                      ...current,
                      [line.itemId]: value,
                    }))
                  }
                  onChange={() => void change(line)}
                  onPick={(product) => void pick(line, product)}
                  onClosePicker={() => setPicking(null)}
                />
              ))}
            </div>
          </>
        )}
      </div>
      {chosen.length > 0 && (
        <div className="footer">
          <div>
            <p style={{ fontWeight: 600 }}>{money(total)}</p>
            <p className="muted">
              {chosen.length} {chosen.length === 1 ? "thing" : "things"}, about
            </p>
          </div>
          {busy ? (
            <button
              className="outline"
              onClick={() =>
                void chrome.runtime.sendMessage({ type: "walmart-stop" })
              }
            >
              Stop
            </button>
          ) : (
            <button onClick={() => void fill()}>Add to Walmart cart</button>
          )}
        </div>
      )}
    </>
  )
}

function JobCard({ job }: { job: WalmartJob }) {
  if (job.running) {
    return (
      <div className="card">
        <p>
          {job.kind === "search"
            ? "Searching Walmart"
            : "Adding to your Walmart cart"}
          : {Math.min(job.done + 1, job.total)} of {job.total}
        </p>
        {job.current && <p className="muted">{job.current}</p>}
        <p className="muted">
          It works in the Walmart tab; leave that tab be until it's done.
        </p>
      </div>
    )
  }
  return (
    <div className="card">
      {job.kind === "fill" && (
        <p>
          Added {job.added.length} {job.added.length === 1 ? "thing" : "things"}{" "}
          to your Walmart cart.
        </p>
      )}
      {job.stopped && <p className="error">{job.stopped}</p>}
      {job.skipped.length > 0 && (
        <p className="muted">
          Skipped:{" "}
          {job.skipped.map((s) => `${s.name} (${s.reason})`).join("; ")}
        </p>
      )}
      {job.kind === "fill" && job.added.length > 0 && (
        <>
          <a
            className="button"
            href={`${WALMART}/cart`}
            target="_blank"
            rel="noreferrer"
          >
            Open your Walmart cart
          </a>
          <p className="muted">Pick a pickup time and check out at Walmart.</p>
        </>
      )}
    </div>
  )
}

function Line({
  line,
  included,
  packages,
  busy,
  picking,
  results,
  searching,
  onInclude,
  onPackages,
  onChange,
  onPick,
  onClosePicker,
}: {
  line: BasketLine
  included: boolean
  packages: number
  busy: boolean
  picking: boolean
  results: StoreProduct[] | null
  searching: boolean
  onInclude: (value: boolean) => void
  onPackages: (value: number) => void
  onChange: () => void
  onPick: (product: StoreProduct) => void
  onClosePicker: () => void
}) {
  const product = line.product
  const cost = lineCost({ product, packages })
  return (
    <div className="line" style={{ opacity: included || !product ? 1 : 0.7 }}>
      <input
        type="checkbox"
        checked={included}
        disabled={!product}
        onChange={(event) => onInclude(event.target.checked)}
        aria-label={`Add ${line.name}`}
      />
      {product?.image ? (
        <img src={product.image} alt="" />
      ) : (
        <div className="no-photo" />
      )}
      <div style={{ display: "grid", gap: 4, minWidth: 0 }}>
        <p className="muted">
          <span style={{ color: "var(--foreground)", fontWeight: 500 }}>
            {line.name}
          </span>
          {line.amount && ` · ${line.amount}`}
        </p>
        {product ? (
          <p style={{ fontSize: 13 }}>{product.name}</p>
        ) : (
          <p className="muted">No Walmart product yet</p>
        )}
        <div className="row" style={{ flexWrap: "wrap", gap: 6 }}>
          {line.suggested && <span className="badge">Nourvio's pick</span>}
          {product && !line.sure && (
            <span className="badge">Check how many</span>
          )}
          {product?.inStock === false && (
            <span className="badge">Out of stock</span>
          )}
          {line.sent && <span className="badge">Sent</span>}
        </div>
        <div className="row spread">
          {product ? (
            <span className="stepper">
              <button
                className="outline"
                aria-label="One fewer"
                disabled={packages <= 1}
                onClick={() => onPackages(packages - 1)}
              >
                −
              </button>
              <span style={{ minWidth: 18, textAlign: "center" }}>
                {packages}
              </span>
              <button
                className="outline"
                aria-label="One more"
                disabled={packages >= 99}
                onClick={() => onPackages(packages + 1)}
              >
                +
              </button>
            </span>
          ) : (
            <span />
          )}
          <span className="row" style={{ gap: 4 }}>
            {cost !== null && (
              <span style={{ fontSize: 13 }}>{money(cost)}</span>
            )}
            <button className="ghost small" disabled={busy} onClick={onChange}>
              {product ? "Change" : "Find"}
            </button>
          </span>
        </div>
        {picking && (
          <div className="picker">
            {searching || (busy && !results) ? (
              <p className="muted">Searching Walmart…</p>
            ) : results?.length ? (
              results.map((option) => (
                <button
                  key={option.id}
                  className="outline"
                  onClick={() => onPick(option)}
                >
                  {option.image ? <img src={option.image} alt="" /> : null}
                  <span style={{ flex: 1, minWidth: 0 }}>
                    {option.name}
                    {option.inStock === false && " (out of stock)"}
                  </span>
                  {(option.salePrice ?? option.price) ? (
                    <span>{money((option.salePrice ?? option.price)!)}</span>
                  ) : null}
                </button>
              ))
            ) : (
              <p className="muted">Nothing found on Walmart for that.</p>
            )}
            <button className="ghost small" onClick={onClosePicker}>
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
