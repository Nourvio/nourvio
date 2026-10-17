import {
  StrictMode,
  useCallback,
  useEffect,
  useState,
  type FormEvent,
} from "react"
import { createRoot } from "react-dom/client"

import { HouseholdSwitch } from "@/lib/households"
import {
  apiFor,
  MerranError,
  unwrap,
  useConnections,
  type Connection,
  type Schemas,
} from "@/lib/merran"
import "@/lib/ui.css"

// The shopping list beside the page, while shopping a store's site: check
// things off as they go in the cart, and add what's missing. It looks
// again every so often, so changes from the household's phones show.

type ShoppingList = Schemas["ShoppingList"]
type Item = Schemas["ListItem"]

/** How often the list is read again while the panel is open. */
const EVERY_MS = 15_000

function Panel() {
  const connections = useConnections()
  if (!connections) return null
  const connection = connections.current
  if (!connection) {
    return (
      <div className="panel stack">
        <h1>Shopping list</h1>
        <p className="muted">
          Connect the extension to your Merran first: click its button in the
          toolbar.
        </p>
      </div>
    )
  }
  // A list of its own for each household.
  return (
    <List
      key={connection.keyId}
      connection={connection}
      all={connections.all}
    />
  )
}

function List({
  connection,
  all,
}: {
  connection: Connection
  all: Connection[]
}) {
  const [list, setList] = useState<ShoppingList | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [shown, setShown] = useState<string | null>(null)
  const [adding, setAdding] = useState("")
  const [busy, setBusy] = useState(false)
  const api = apiFor(connection)

  const load = useCallback(async () => {
    try {
      setList(
        await unwrap(apiFor(connection).GET("/api/list"), connection.origin)
      )
      setError(null)
    } catch (err) {
      setError((err as MerranError).message)
    }
  }, [connection])

  useEffect(() => {
    void load()
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void load()
    }, EVERY_MS)
    const visible = () => {
      if (document.visibilityState === "visible") void load()
    }
    document.addEventListener("visibilitychange", visible)
    return () => {
      clearInterval(timer)
      document.removeEventListener("visibilitychange", visible)
    }
  }, [load])

  async function check(item: Item, checked: boolean) {
    // Shows at once; the list read again puts it right if it didn't save.
    setList(
      (now) =>
        now && {
          ...now,
          items: now.items.map((other) =>
            other.id === item.id ? { ...other, checked } : other
          ),
        }
    )
    try {
      await unwrap(
        api.PATCH("/api/list/items/{itemId}", {
          params: { path: { itemId: item.id } },
          body: { checked },
        }),
        connection.origin
      )
    } catch (err) {
      setError((err as MerranError).message)
      void load()
    }
  }

  async function add(event: FormEvent) {
    event.preventDefault()
    const text = adding.trim()
    if (!text) return
    setBusy(true)
    try {
      await unwrap(
        api.POST("/api/list/items", {
          body: { text, ...(listId ? { list: listId } : {}) },
        }),
        connection.origin
      )
      setAdding("")
      await load()
    } catch (err) {
      setError((err as MerranError).message)
    } finally {
      setBusy(false)
    }
  }

  const lists = list?.lists ?? []
  const listId = shown ?? lists[0]?.id ?? null
  const items = (list?.items ?? []).filter((item) => item.list === listId)
  const toGet = items.filter((item) => !item.checked)
  const got = items.filter((item) => item.checked)
  const aisleName = new Map((list?.aisles ?? []).map((a) => [a.id, a.name]))
  const byAisle = new Map<string, Item[]>()
  for (const item of toGet) {
    const name = (item.aisle && aisleName.get(item.aisle)) || "Other"
    byAisle.set(name, [...(byAisle.get(name) ?? []), item])
  }

  return (
    <div className="panel stack">
      <div className="row between">
        <h1>Shopping list</h1>
        <a
          href={`${connection.origin}/list`}
          target="_blank"
          rel="noreferrer"
          className="small"
        >
          Open in Merran
        </a>
      </div>
      <HouseholdSwitch current={connection} all={all} />

      {lists.length > 1 && (
        <select
          value={listId ?? ""}
          onChange={(event) => setShown(event.target.value)}
          aria-label="Which list"
        >
          {lists.map((option) => (
            <option key={option.id} value={option.id}>
              {option.name}
            </option>
          ))}
        </select>
      )}

      <form className="row" onSubmit={add}>
        <input
          type="text"
          className="grow"
          value={adding}
          onChange={(event) => setAdding(event.target.value)}
          placeholder="Add something: 2 lemons"
          aria-label="Add to the list"
        />
        <button type="submit" disabled={busy || !adding.trim()}>
          Add
        </button>
      </form>

      {error && (
        <p className="error" role="status">
          {error}
        </p>
      )}

      {list === null && !error ? (
        <p className="muted">Getting the list…</p>
      ) : toGet.length === 0 ? (
        <p className="muted">
          {got.length > 0 ? "That's everything." : "The list is empty."}
        </p>
      ) : (
        [...byAisle].map(([aisle, aisleItems]) => (
          <section key={aisle} className="aisle">
            <h3>{aisle}</h3>
            {aisleItems.map((item) => (
              <ItemRow key={item.id} item={item} onCheck={check} />
            ))}
          </section>
        ))
      )}

      {got.length > 0 && (
        <section className="aisle">
          <h3>In the cart</h3>
          {got.map((item) => (
            <ItemRow key={item.id} item={item} onCheck={check} />
          ))}
        </section>
      )}
    </div>
  )
}

function ItemRow({
  item,
  onCheck,
}: {
  item: Item
  onCheck: (item: Item, checked: boolean) => void
}) {
  return (
    <label className={item.checked ? "item checked" : "item"}>
      <input
        type="checkbox"
        checked={item.checked}
        onChange={(event) => onCheck(item, event.target.checked)}
      />
      <span className="grow">
        <span className="name">{item.name}</span>
        {item.amount && <span className="amount"> · {item.amount}</span>}
      </span>
    </label>
  )
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Panel />
  </StrictMode>
)
