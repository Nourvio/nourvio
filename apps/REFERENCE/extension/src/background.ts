import { mise, setConnection, type Connection } from "./mise.ts"
import { listenForToken, readPage, showNote } from "./page.ts"
import {
  getJob,
  runFill,
  runSearch,
  type FillRequest,
  type SearchRequest,
} from "./walmart-jobs.ts"

type ImportResult = {
  recipe: { slug: string; name: string }
  duplicate: boolean
}

/**
 * Connect pages this extension opened, by tab, waiting for their token.
 * Kept in session storage: Chrome stops this worker when it's idle.
 */
const connecting = {
  async get(tabId: number) {
    const key = `connecting:${tabId}`
    return (
      ((await chrome.storage.session.get(key))[key] as string | undefined) ??
      null
    )
  },
  set: (tabId: number, origin: string) =>
    chrome.storage.session.set({ [`connecting:${tabId}`]: origin }),
  delete: (tabId: number) =>
    chrome.storage.session.remove(`connecting:${tabId}`),
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: "import-page",
      title: "Import this recipe into Nourvio",
      contexts: ["page"],
    })
    chrome.contextMenus.create({
      id: "import-link",
      title: "Import this link into Nourvio",
      contexts: ["link"],
    })
    chrome.contextMenus.create({
      id: "add-to-list",
      title: "Add “%s” to the Nourvio shopping list",
      contexts: ["selection"],
    })
  })
})

async function note(
  tabId: number | undefined,
  message: string,
  link: string | null,
  isError = false
) {
  if (tabId === undefined) return
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      func: showNote,
      args: [message, link, isError],
    })
  } catch {
    // Some pages (the browser's own) can't show it; nothing to do.
  }
}

async function recipeLink(slug: string) {
  const { connection } = await chrome.storage.local.get("connection")
  return connection
    ? `${(connection as Connection).origin}/recipes/${slug}`
    : null
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  const tabId = tab?.id
  try {
    if (info.menuItemId === "import-page" && tabId !== undefined) {
      const [read] = await chrome.scripting.executeScript({
        target: { tabId },
        func: readPage,
      })
      const page = read!.result!
      const result = await mise<ImportResult>("/import/page", {
        body: {
          url: page.url,
          title: page.title,
          jsonld: page.jsonld,
          images: page.images,
          text: page.text,
        },
      })
      await note(
        tabId,
        result.duplicate
          ? `${result.recipe.name} is in your library already.`
          : `Imported ${result.recipe.name}.`,
        await recipeLink(result.recipe.slug)
      )
    } else if (info.menuItemId === "import-link" && info.linkUrl) {
      await note(tabId, "Importing that link…", null)
      const result = await mise<ImportResult>("/import/url", {
        body: { url: info.linkUrl },
      })
      await note(
        tabId,
        result.duplicate
          ? `${result.recipe.name} is in your library already.`
          : `Imported ${result.recipe.name}.`,
        await recipeLink(result.recipe.slug)
      )
    } else if (info.menuItemId === "add-to-list" && info.selectionText) {
      const lines = info.selectionText
        .split(/\n|,(?![^(]*\))/)
        .map((line) => line.trim())
        .filter(Boolean)
        .slice(0, 30)
      for (const text of lines) {
        await mise("/list/items", { body: { text: text.slice(0, 200) } })
      }
      await note(
        tabId,
        lines.length === 1
          ? `Added ${lines[0]} to the shopping list.`
          : `Added ${lines.length} things to the shopping list.`,
        null
      )
    }
  } catch (error) {
    await note(tabId, (error as Error).message, null, true)
  }
})

chrome.runtime.onMessage.addListener((message, sender) => {
  // From the side panel: long Walmart jobs, one at a time.
  if (message?.type === "walmart-search" || message?.type === "walmart-fill") {
    void (async () => {
      if ((await getJob())?.running) return
      if (message.type === "walmart-search") {
        await runSearch(message.request as SearchRequest)
      } else {
        await runFill(message.request as FillRequest)
      }
    })()
    return
  }
  if (message?.type === "walmart-stop") {
    void chrome.storage.session.set({ walmartCancel: true })
    return
  }
  // From the popup: open Nourvio's connect page, then listen there for the token.
  if (message?.type === "connect" && typeof message.origin === "string") {
    void chrome.tabs
      .create({ url: `${message.origin}/extension/connect` })
      .then((tab) => {
        if (tab.id !== undefined) connecting.set(tab.id, message.origin)
      })
    return
  }
  // From that page: the token it handed over.
  if (message?.type === "connect-token") {
    const tabId = sender.tab?.id
    if (tabId === undefined) return
    void (async () => {
      const origin = await connecting.get(tabId)
      if (!origin || origin !== message.origin) return
      await connecting.delete(tabId)
      const connection: Connection = {
        origin,
        token: String(message.token),
        tokenId: message.tokenId ? String(message.tokenId) : null,
        name: String(message.name ?? ""),
      }
      // Check it works before keeping it.
      const { user } = await mise<{ user: { displayName: string } }>(
        "/auth/me",
        { connection }
      )
      await setConnection({ ...connection, name: user.displayName })
    })().catch(() => {})
  }
})

// Once a connect page has loaded, listen on it for the token.
chrome.tabs.onUpdated.addListener((tabId, change, tab) => {
  if (change.status !== "complete") return
  void (async () => {
    const origin = await connecting.get(tabId)
    if (!origin || !tab.url?.startsWith(origin)) return
    await chrome.scripting.executeScript({
      target: { tabId },
      func: listenForToken,
      args: [origin],
    })
  })().catch(() => {})
})

chrome.tabs.onRemoved.addListener((tabId) => void connecting.delete(tabId))
