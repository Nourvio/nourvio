import { StrictMode, useEffect, useState } from "react"
import { createRoot } from "react-dom/client"
import type { ShoppingItem, StoreProduct } from "@mise/shared"

import {
  getConnection,
  mise,
  MiseError,
  originOf,
  setConnection,
  type Connection,
} from "./mise.ts"
import { readPage, type PageRead } from "./page.ts"
import { readProductPage, toProduct } from "./walmart.ts"
import "./ui.css"

type ImportResult = {
  recipe: { slug: string; name: string }
  duplicate: boolean
}

type PageState =
  | { step: "reading" }
  | { step: "unreadable" }
  | { step: "ready"; page: PageRead }
  | { step: "importing"; page: PageRead }
  | { step: "imported"; page: PageRead; result: ImportResult }
  | { step: "failed"; page: PageRead; message: string }

function Popup() {
  const [connection, setState] = useState<Connection | null | undefined>()

  useEffect(() => {
    void getConnection().then(setState)
    const onChange = (
      changes: Record<string, chrome.storage.StorageChange>
    ) => {
      if ("connection" in changes) {
        setState(
          (changes.connection.newValue as Connection | undefined) ?? null
        )
      }
    }
    chrome.storage.local.onChanged.addListener(onChange)
    return () => chrome.storage.local.onChanged.removeListener(onChange)
  }, [])

  if (connection === undefined) return null
  return connection ? <Connected connection={connection} /> : <Connect />
}

function Brand() {
  return (
    <div className="brand">
      <img src="icons/48.png" alt="" />
      <h1>Nourvio</h1>
    </div>
  )
}

function Connect() {
  const [address, setAddress] = useState("")
  const [error, setError] = useState<string>()

  async function connect(event: React.FormEvent) {
    event.preventDefault()
    setError(undefined)
    let origin: string
    try {
      origin = originOf(address)
    } catch {
      setError("That doesn't look like an address.")
      return
    }
    // The browser asks the person to let the extension talk to their Nourvio.
    const granted = await chrome.permissions.request({
      origins: [`${origin}/*`],
    })
    if (!granted) {
      setError("The extension needs to reach your Nourvio to connect.")
      return
    }
    await chrome.runtime.sendMessage({ type: "connect", origin })
    window.close()
  }

  return (
    <form className="stack" onSubmit={connect}>
      <Brand />
      <p className="muted">
        Connect to your Nourvio to import recipes from any page and keep the
        shopping list beside you.
      </p>
      <input
        type="text"
        value={address}
        onChange={(event) => setAddress(event.target.value)}
        placeholder="nourvio.example.com"
        aria-label="Your Nourvio's address"
        autoFocus
      />
      {error && <p className="error">{error}</p>}
      <button type="submit" disabled={!address.trim()}>
        Connect
      </button>
      <p className="muted">
        Your browser asks to let the extension reach that address, then Nourvio
        opens to confirm it's you.
      </p>
    </form>
  )
}

function Connected({ connection }: { connection: Connection }) {
  const [state, setState] = useState<PageState>({ step: "reading" })
  const [walmart, setWalmart] = useState<StoreProduct | null>(null)

  useEffect(() => {
    void (async () => {
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      })
      if (tab?.id === undefined) return setState({ step: "unreadable" })
      // A Walmart product page: offer it as the product for a list item.
      if (/^https:\/\/www\.walmart\.com\/ip\//.test(tab.url ?? "")) {
        try {
          const [read] = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: readProductPage,
          })
          if (read?.result) setWalmart(toProduct(read.result))
        } catch {
          // Not readable; the recipe import below says so.
        }
      }
      try {
        const [read] = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: readPage,
        })
        const page = read?.result
        if (!page || !/^https?:/.test(page.url))
          return setState({ step: "unreadable" })
        setState({ step: "ready", page })
      } catch {
        setState({ step: "unreadable" })
      }
    })()
  }, [])

  async function importPage(page: PageRead) {
    setState({ step: "importing", page })
    try {
      const result = await mise<ImportResult>("/import/page", {
        body: {
          url: page.url,
          title: page.title,
          jsonld: page.jsonld,
          images: page.images,
          text: page.text,
        },
      })
      setState({ step: "imported", page, result })
    } catch (error) {
      setState({
        step: "failed",
        page,
        message:
          error instanceof MiseError ? error.message : "That didn't work.",
      })
    }
  }

  async function openList() {
    const window = await chrome.windows.getCurrent()
    if (window.id !== undefined)
      await chrome.sidePanel.open({ windowId: window.id })
    self.close()
  }

  async function disconnect() {
    if (connection.tokenId) {
      await mise(`/extension/tokens/${connection.tokenId}`, {
        method: "DELETE",
      }).catch(() => {})
    }
    await setConnection(null)
  }

  const open = (path: string) => {
    void chrome.tabs.create({ url: `${connection.origin}${path}` })
    self.close()
  }

  if (walmart) {
    return (
      <div className="stack">
        <Brand />
        <WalmartPick product={walmart} />
        <button className="outline" onClick={openList}>
          Shopping list
        </button>
      </div>
    )
  }

  return (
    <div className="stack">
      <Brand />
      {state.step === "reading" ? (
        <p className="muted">Reading this page…</p>
      ) : state.step === "unreadable" ? (
        <p className="muted">Open a recipe page to import it.</p>
      ) : (
        <div className="card">
          <p style={{ fontWeight: 500 }}>
            {state.page.title || state.page.url}
          </p>
          {state.page.hasRecipe ? (
            <span className="badge" style={{ justifySelf: "start" }}>
              Recipe found
            </span>
          ) : (
            <p className="muted">
              No recipe data on this page; Nourvio's AI can still try to read
              it.
            </p>
          )}
          {state.step === "imported" ? (
            <>
              <p>
                {state.result.duplicate
                  ? `${state.result.recipe.name} is in your library already.`
                  : `Imported ${state.result.recipe.name}.`}
              </p>
              <button
                onClick={() => open(`/recipes/${state.result.recipe.slug}`)}
              >
                Open in Nourvio
              </button>
            </>
          ) : (
            <>
              {state.step === "failed" && (
                <p className="error">{state.message}</p>
              )}
              <button
                disabled={state.step === "importing"}
                onClick={() => importPage(state.page)}
              >
                {state.step === "importing"
                  ? "Importing…"
                  : state.page.hasRecipe
                    ? "Import this recipe"
                    : "Try to import this page"}
              </button>
            </>
          )}
        </div>
      )}
      <div className="row">
        <button className="outline" style={{ flex: 1 }} onClick={openList}>
          Shopping list
        </button>
        <button
          className="outline"
          style={{ flex: 1 }}
          onClick={() => open("/")}
        >
          Open Nourvio
        </button>
      </div>
      <div className="row spread">
        <p className="muted">
          {connection.name ? `${connection.name} · ` : ""}
          {new URL(connection.origin).host}
        </p>
        <button className="ghost small" onClick={disconnect}>
          Disconnect
        </button>
      </div>
    </div>
  )
}

/** On a Walmart product page: use it for something on the list, from now on. */
function WalmartPick({ product }: { product: StoreProduct }) {
  const [items, setItems] = useState<ShoppingItem[] | null>(null)
  const [itemId, setItemId] = useState("")
  const [saved, setSaved] = useState<string | null>(null)
  const [error, setError] = useState<string>()

  useEffect(() => {
    mise<{ items: ShoppingItem[] }>("/list").then(
      ({ items }) => setItems(items.filter((item) => !item.checked)),
      (e) =>
        setError(e instanceof MiseError ? e.message : "Couldn't load the list.")
    )
  }, [])

  async function save() {
    try {
      await mise(`/shop/walmart/products/${itemId}`, {
        method: "PUT",
        body: { product },
      })
      setSaved(items?.find((item) => item.id === itemId)?.name ?? "it")
    } catch (e) {
      setError(e instanceof MiseError ? e.message : "Couldn't save that.")
    }
  }

  return (
    <div className="card">
      <p style={{ fontWeight: 500 }}>{product.name}</p>
      <p className="muted">
        {[
          product.size,
          product.price !== null &&
            `$${(product.salePrice ?? product.price).toFixed(2)}`,
        ]
          .filter(Boolean)
          .join(" · ")}
      </p>
      {saved ? (
        <p>Nourvio will buy this for {saved} at Walmart from now on.</p>
      ) : items === null ? (
        !error && <p className="muted">Loading the list…</p>
      ) : items.length ? (
        <>
          <label className="muted" style={{ display: "grid", gap: 4 }}>
            Use this for
            <select
              value={itemId}
              onChange={(event) => setItemId(event.target.value)}
            >
              <option value="">Something on the list…</option>
              {items.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                  {item.amount ? ` (${item.amount})` : ""}
                </option>
              ))}
            </select>
          </label>
          <button disabled={!itemId} onClick={() => void save()}>
            Use this at Walmart
          </button>
        </>
      ) : (
        <p className="muted">The shopping list is empty.</p>
      )}
      {error && <p className="error">{error}</p>}
    </div>
  )
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Popup />
  </StrictMode>
)
