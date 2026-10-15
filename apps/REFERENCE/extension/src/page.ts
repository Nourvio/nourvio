/**
 * Functions run inside a web page with chrome.scripting.executeScript. Each
 * is sent on its own, so it can't use anything from outside itself.
 */

/** What the extension reads from a page to import it. */
export type PageRead = {
  url: string
  title: string
  jsonld: string[]
  images: string[]
  text: string
  /** The page says it has a recipe in its data. */
  hasRecipe: boolean
}

/** Reads the open page as the browser shows it: its recipe data, photo and text. */
export function readPage(): PageRead {
  const blocks = Array.from(
    document.querySelectorAll('script[type="application/ld+json"]')
  )
    .map((script) => script.textContent ?? "")
    .filter((text) => text.trim())
  const isRecipe = (text: string) =>
    /"@type"\s*:\s*(\[[^\]]*)?"Recipe"/.test(text)
  // Keep it small: a page can carry a lot of other data.
  let jsonld = blocks.slice(0, 20).map((text) => text.slice(0, 400_000))
  if (jsonld.reduce((sum, text) => sum + text.length, 0) > 600_000) {
    jsonld = jsonld.filter(isRecipe)
  }
  const meta = (selector: string) =>
    document.querySelector<HTMLMetaElement>(selector)?.content?.trim() ?? ""
  const images = [
    meta('meta[property="og:image"]'),
    meta('meta[name="twitter:image"]'),
  ].filter(Boolean)
  const root =
    document.querySelector("main") ??
    document.querySelector("article") ??
    document.body
  return {
    url: location.href,
    title: document.title,
    jsonld,
    images,
    text: (root?.innerText ?? "").slice(0, 80_000),
    hasRecipe: blocks.some(isRecipe),
  }
}

/** A small note in the corner of the page, for the right-click actions. */
export function showNote(
  message: string,
  link: string | null,
  isError: boolean
) {
  const id = "mise-extension-note"
  document.getElementById(id)?.remove()
  const note = document.createElement("div")
  note.id = id
  note.setAttribute("role", "status")
  Object.assign(note.style, {
    position: "fixed",
    right: "20px",
    bottom: "20px",
    zIndex: "2147483647",
    maxWidth: "340px",
    padding: "12px 16px",
    borderRadius: "16px",
    background: isError ? "#7f1d1d" : "#2f4a37",
    color: "#fdfbf6",
    font: "500 14px/1.4 system-ui, sans-serif",
    boxShadow: "0 8px 30px rgba(0,0,0,.25)",
  })
  note.textContent = message
  if (link) {
    const a = document.createElement("a")
    a.href = link
    a.target = "_blank"
    a.rel = "noreferrer"
    a.textContent = " Open in Nourvio"
    Object.assign(a.style, { color: "#fdfbf6", textDecoration: "underline" })
    note.append(a)
  }
  document.body.append(note)
  setTimeout(() => note.remove(), 6000)
}

/**
 * On Nourvio's own "Connect the extension" page: takes the token the page
 * offers and tells the page it arrived. Only ever run on that page.
 */
export function listenForToken(expectedOrigin: string) {
  const flag = "__miseExtensionListening"
  const holder = window as unknown as Record<string, boolean>
  if (holder[flag]) return
  holder[flag] = true
  window.addEventListener("message", (event) => {
    if (event.source !== window || event.origin !== expectedOrigin) return
    const data = event.data as {
      source?: string
      type?: string
      token?: string
      tokenId?: string
      name?: string
    }
    if (data?.source !== "mise" || data.type !== "extension-token") return
    if (typeof data.token !== "string") return
    void chrome.runtime.sendMessage({
      type: "connect-token",
      origin: expectedOrigin,
      token: data.token,
      tokenId: data.tokenId ?? null,
      name: data.name ?? "",
    })
    window.postMessage(
      { source: "mise-extension", type: "token-received" },
      expectedOrigin
    )
  })
}
