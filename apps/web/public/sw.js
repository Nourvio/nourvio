// Mise's service worker. For now it does one thing: when Mise, installed on
// an Android home screen, is picked in the share sheet, it keeps what was
// shared (photos, PDFs, text or a link) and opens the page that deals with
// it. Everything else goes straight to the network as usual.

const SHARE_CACHE = "mise-share"

self.addEventListener("install", () => self.skipWaiting())
self.addEventListener("activate", (event) =>
  event.waitUntil(self.clients.claim())
)

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url)
  if (event.request.method === "POST" && url.pathname === "/share") {
    event.respondWith(receiveShare(event.request))
  }
})

async function receiveShare(request) {
  const form = await request.formData()
  const text = [form.get("title"), form.get("text")]
    .filter((value) => typeof value === "string" && value.trim())
    .join("\n")
  const link = form.get("url")
  const files = form.getAll("file").filter((file) => file instanceof File)

  // A link alone, like a recipe page: straight to importing it.
  if (!files.length && (link || /https?:\/\/\S+/.test(text))) {
    const params = new URLSearchParams()
    if (typeof link === "string" && link) params.set("url", link)
    if (text) params.set("text", text)
    return Response.redirect(`/recipes?${params}`, 303)
  }

  const id = crypto.randomUUID()
  const cache = await caches.open(SHARE_CACHE)
  await Promise.all(
    files.map((file, index) =>
      cache.put(
        `/shared/${id}/${index}`,
        new Response(file, {
          headers: {
            "content-type": file.type || "application/octet-stream",
            "x-file-name": encodeURIComponent(file.name || `shared-${index}`),
          },
        })
      )
    )
  )
  await cache.put(
    `/shared/${id}/about`,
    new Response(JSON.stringify({ text, files: files.length }), {
      headers: { "content-type": "application/json" },
    })
  )
  return Response.redirect(`/share?id=${id}`, 303)
}
