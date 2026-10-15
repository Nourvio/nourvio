/** Where the service worker keeps what was shared into Nourvio (public/sw.js). */
const SHARE_CACHE = "mise-share"

export type Shared = { files: File[]; text: string | null }

/** What was shared, by the id the service worker gave it; null if it's gone. */
export async function readShared(id: string): Promise<Shared | null> {
  if (typeof caches === "undefined") return null
  try {
    const cache = await caches.open(SHARE_CACHE)
    const about = await cache.match(`/shared/${id}/about`)
    if (!about) return null
    const info = (await about.json()) as { text: string; files: number }
    const files: File[] = []
    for (let index = 0; index < info.files; index++) {
      const res = await cache.match(`/shared/${id}/${index}`)
      if (!res) continue
      const blob = await res.blob()
      const name = decodeURIComponent(
        res.headers.get("x-file-name") ?? `shared-${index}`
      )
      files.push(new File([blob], name, { type: blob.type }))
    }
    return { files, text: info.text || null }
  } catch {
    return null
  }
}

/** Forgets something shared once it's been dealt with. */
export async function forgetShared(id: string) {
  if (typeof caches === "undefined") return
  try {
    const cache = await caches.open(SHARE_CACHE)
    for (const request of await cache.keys()) {
      if (new URL(request.url).pathname.startsWith(`/shared/${id}/`)) {
        await cache.delete(request)
      }
    }
  } catch {
    // Left for the browser to clear.
  }
}

/**
 * Registers the service worker, which is what lets Android share into Nourvio.
 * Browsers only allow it over https, or on this computer.
 */
export function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return
  const secure =
    location.protocol === "https:" ||
    location.hostname === "localhost" ||
    location.hostname === "127.0.0.1"
  if (!secure) return
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("/sw.js").catch(() => {
      // Sharing into Nourvio just won't be offered.
    })
  })
}
