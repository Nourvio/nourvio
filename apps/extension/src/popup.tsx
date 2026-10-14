import { StrictMode, useEffect, useState } from "react"
import { createRoot } from "react-dom/client"

import {
  getConnection,
  mise,
  MiseError,
  originOf,
  setConnection,
  type Connection,
} from "./mise.ts"
import { readPage, type PageRead } from "./page.ts"
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
      <h1>Mise</h1>
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
    // The browser asks the person to let the extension talk to their Mise.
    const granted = await chrome.permissions.request({
      origins: [`${origin}/*`],
    })
    if (!granted) {
      setError("The extension needs to reach your Mise to connect.")
      return
    }
    await chrome.runtime.sendMessage({ type: "connect", origin })
    window.close()
  }

  return (
    <form className="stack" onSubmit={connect}>
      <Brand />
      <p className="muted">
        Connect to your Mise to import recipes from any page and keep the
        shopping list beside you.
      </p>
      <input
        type="text"
        value={address}
        onChange={(event) => setAddress(event.target.value)}
        placeholder="mise.example.com"
        aria-label="Your Mise's address"
        autoFocus
      />
      {error && <p className="error">{error}</p>}
      <button type="submit" disabled={!address.trim()}>
        Connect
      </button>
      <p className="muted">
        Your browser asks to let the extension reach that address, then Mise
        opens to confirm it's you.
      </p>
    </form>
  )
}

function Connected({ connection }: { connection: Connection }) {
  const [state, setState] = useState<PageState>({ step: "reading" })

  useEffect(() => {
    void (async () => {
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      })
      if (tab?.id === undefined) return setState({ step: "unreadable" })
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
              No recipe data on this page; Mise's AI can still try to read it.
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
                Open in Mise
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
          Open Mise
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

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Popup />
  </StrictMode>
)
