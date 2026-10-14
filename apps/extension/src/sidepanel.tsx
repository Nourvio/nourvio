import { StrictMode, useCallback, useEffect, useState } from "react"
import { createRoot } from "react-dom/client"
import { STORE_SECTIONS, type ShoppingItem } from "@mise/shared"

import { getConnection, mise, MiseError, type Connection } from "./mise.ts"
import "./ui.css"

/** Stores to search for an item in the tab beside the list. */
const STORES = {
  none: { name: "No store", search: null },
  walmart: {
    name: "Walmart",
    search: (q: string) =>
      `https://www.walmart.com/search?q=${encodeURIComponent(q)}`,
  },
  costco: {
    name: "Costco Same-Day",
    search: (q: string) =>
      `https://sameday.costco.com/store/costco/s?k=${encodeURIComponent(q)}`,
  },
  frys: {
    name: "Fry's",
    search: (q: string) =>
      `https://www.frysfood.com/search?query=${encodeURIComponent(q)}`,
  },
} as const
type StoreKey = keyof typeof STORES

function SidePanel() {
  const [connection, setConnection] = useState<Connection | null | undefined>()
  const [items, setItems] = useState<ShoppingItem[] | null>(null)
  const [error, setError] = useState<string>()
  const [store, setStore] = useState<StoreKey>("none")

  const load = useCallback(async () => {
    try {
      const { items } = await mise<{ items: ShoppingItem[] }>("/list")
      setItems(items)
      setError(undefined)
    } catch (e) {
      setError(e instanceof MiseError ? e.message : "Couldn't load the list.")
    }
  }, [])

  useEffect(() => {
    void getConnection().then((found) => {
      setConnection(found)
      if (found) void load()
    })
    void chrome.storage.local.get("searchStore").then(({ searchStore }) => {
      if (typeof searchStore === "string" && searchStore in STORES) {
        setStore(searchStore as StoreKey)
      }
    })
    // Keep up with changes made in Mise, now and then and when looked at.
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void load()
    }, 30_000)
    const onFocus = () => void load()
    window.addEventListener("focus", onFocus)
    return () => {
      clearInterval(timer)
      window.removeEventListener("focus", onFocus)
    }
  }, [load])

  async function check(item: ShoppingItem) {
    setItems(
      (current) =>
        current?.map((i) => (i.id === item.id ? { ...i, checked: true } : i)) ??
        null
    )
    try {
      await mise(`/list/items/${item.id}`, {
        method: "PATCH",
        body: { checked: true },
      })
    } catch (e) {
      setError(e instanceof MiseError ? e.message : "Couldn't check that off.")
      void load()
    }
  }

  async function search(item: ShoppingItem) {
    const url = STORES[store].search?.(item.name)
    if (!url) return
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    if (tab?.id !== undefined) await chrome.tabs.update(tab.id, { url })
    else await chrome.tabs.create({ url })
  }

  function pickStore(value: StoreKey) {
    setStore(value)
    void chrome.storage.local.set({ searchStore: value })
  }

  if (connection === undefined) return null
  if (!connection) {
    return (
      <div className="stack">
        <h1>Shopping list</h1>
        <p className="muted">
          Connect the extension to your Mise first: click the Mise icon in the
          toolbar.
        </p>
      </div>
    )
  }

  const toGet = (items ?? []).filter((item) => !item.checked)
  const got = (items ?? []).length - toGet.length
  const sections = STORE_SECTIONS.map((section) => ({
    ...section,
    items: toGet.filter((item) => item.sectionId === section.id),
  })).filter((section) => section.items.length)

  return (
    <div className="stack">
      <div className="row spread">
        <h1>Shopping list</h1>
        <button className="ghost small" onClick={() => void load()}>
          Refresh
        </button>
      </div>
      <label className="muted" style={{ display: "grid", gap: 4 }}>
        Search for each item at
        <select
          value={store}
          onChange={(event) => pickStore(event.target.value as StoreKey)}
        >
          {Object.entries(STORES).map(([key, value]) => (
            <option key={key} value={key}>
              {value.name}
            </option>
          ))}
        </select>
      </label>
      {error && <p className="error">{error}</p>}
      {items === null ? (
        !error && <p className="muted">Loading…</p>
      ) : !toGet.length ? (
        <p className="muted">Nothing left to get.</p>
      ) : (
        <>
          <p className="muted">
            {toGet.length} to get{got ? `, ${got} in the cart` : ""}. Check
            things off as they go in the cart.
          </p>
          {sections.map((section) => (
            <div key={section.id} style={{ display: "grid", gap: 6 }}>
              <p className="section-name">{section.name}</p>
              <ul className="items">
                {section.items.map((item) => (
                  <li key={item.id}>
                    <input
                      type="checkbox"
                      aria-label={`Check off ${item.name}`}
                      onChange={() => void check(item)}
                    />
                    <span className="name">
                      {item.name}
                      {item.amount && (
                        <span className="amount">{item.amount}</span>
                      )}
                    </span>
                    {STORES[store].search && (
                      <button
                        className="small outline"
                        onClick={() => void search(item)}
                        title={`Search ${STORES[store].name} for ${item.name}`}
                      >
                        Find
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </>
      )}
    </div>
  )
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <SidePanel />
  </StrictMode>
)
