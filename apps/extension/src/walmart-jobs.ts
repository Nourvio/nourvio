import type { Basket, StoreProduct } from "@mise/shared"

import { mise } from "./mise.ts"
import {
  addToCartOnPage,
  candidates,
  readSearchResults,
  searchUrl,
  WALMART,
} from "./walmart.ts"

/** A long Walmart job, followed by the side panel through session storage. */
export type WalmartJob = {
  kind: "search" | "fill"
  running: boolean
  total: number
  done: number
  /** What it's on now. */
  current: string | null
  /** Search results, by list item, for picking by hand. */
  results: Record<string, StoreProduct[]>
  added: { name: string; quantity: number }[]
  skipped: { name: string; reason: string }[]
  /** Why it stopped early. */
  stopped: string | null
}

export type SearchRequest = {
  items: { itemId: string; name: string }[]
  /** Let Mise pick from the results (else they're only offered). */
  suggest: boolean
}

export type FillRequest = {
  lines: { itemId: string; productId: string; name: string; quantity: number }[]
}

/** Walmart answers quick bursts with errors; a steady pace is fine. */
const PAUSE_MS = 1500

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

async function setJob(job: WalmartJob) {
  await chrome.storage.session.set({ walmartJob: job })
}

async function cancelled() {
  const { walmartCancel } = await chrome.storage.session.get("walmartCancel")
  return Boolean(walmartCancel)
}

export async function getJob() {
  const { walmartJob } = await chrome.storage.session.get("walmartJob")
  return (walmartJob as WalmartJob | undefined) ?? null
}

/** The Walmart tab Mise works in: the one it used before, or a new one. */
async function walmartTab() {
  const { walmartTabId } = await chrome.storage.session.get("walmartTabId")
  if (typeof walmartTabId === "number") {
    try {
      const tab = await chrome.tabs.get(walmartTabId)
      if (tab.id !== undefined && tab.url?.startsWith(WALMART)) return tab.id
    } catch {
      // Closed; open another.
    }
  }
  const tab = await chrome.tabs.create({ url: `${WALMART}/`, active: true })
  await chrome.storage.session.set({ walmartTabId: tab.id })
  return tab.id!
}

/** Goes to a page in the Walmart tab and waits for it to load. */
async function visit(tabId: number, url: string, mustContain: string) {
  await chrome.tabs.update(tabId, { url })
  const end = Date.now() + 25_000
  while (Date.now() < end) {
    await sleep(400)
    const tab = await chrome.tabs.get(tabId)
    if (tab.status === "complete" && tab.url?.includes(mustContain)) {
      // Let the page come to life.
      await sleep(800)
      return
    }
  }
  throw new Error("Walmart took too long to load")
}

const BLOCKED =
  "Walmart wants to check you're a person. Finish that in the Walmart tab, then try again."

/** Searches Walmart for each item in the Walmart tab, then lets Mise pick (or just offers the results). */
export async function runSearch(request: SearchRequest) {
  const job: WalmartJob = {
    kind: "search",
    running: true,
    total: request.items.length,
    done: 0,
    current: null,
    results: {},
    added: [],
    skipped: [],
    stopped: null,
  }
  await chrome.storage.session.set({ walmartCancel: false })
  await setJob(job)
  try {
    const tabId = await walmartTab()
    for (const item of request.items) {
      if (await cancelled()) {
        job.stopped = "Stopped."
        break
      }
      job.current = item.name
      await setJob(job)
      await visit(tabId, searchUrl(item.name), "/search")
      let found: ReturnType<typeof readSearchResults> = {
        blocked: false,
        products: null,
      }
      // The results can arrive a moment after the page.
      for (let tries = 0; tries < 6 && !found.products; tries++) {
        const [result] = await chrome.scripting.executeScript({
          target: { tabId },
          func: readSearchResults,
        })
        found = result?.result ?? found
        if (found.blocked) break
        if (!found.products) await sleep(700)
      }
      if (found.blocked) {
        job.stopped = BLOCKED
        break
      }
      job.results[item.itemId] = candidates(found.products ?? [])
      job.done++
      await setJob(job)
      await sleep(PAUSE_MS)
    }
    if (request.suggest) {
      const items = Object.entries(job.results)
        .filter(([, products]) => products.length)
        .map(([itemId, products]) => ({ itemId, products }))
      if (items.length) {
        await mise<{ basket: Basket }>("/shop/walmart/suggest", {
          body: { items },
        })
      }
    }
  } catch (error) {
    job.stopped = (error as Error).message
  }
  job.running = false
  job.current = null
  await setJob(job)
}

/** Adds each line to the Walmart cart from its product page, one at a time. */
export async function runFill(request: FillRequest) {
  const job: WalmartJob = {
    kind: "fill",
    running: true,
    total: request.lines.length,
    done: 0,
    current: null,
    results: {},
    added: [],
    skipped: [],
    stopped: null,
  }
  const sent: { itemId: string; packages: number }[] = []
  await chrome.storage.session.set({ walmartCancel: false })
  await setJob(job)
  try {
    const tabId = await walmartTab()
    for (const line of request.lines) {
      if (await cancelled()) {
        job.stopped = "Stopped."
        break
      }
      job.current = line.name
      await setJob(job)
      // Walmart sometimes moves on to an "Added to cart" page part way
      // through; then open the product again and carry on from what's in
      // the cart.
      let outcome: Awaited<ReturnType<typeof addToCartOnPage>> | undefined
      for (let attempt = 0; attempt < 3 && !outcome; attempt++) {
        await visit(tabId, `${WALMART}/ip/${line.productId}`, line.productId)
        try {
          const [result] = await chrome.scripting.executeScript({
            target: { tabId },
            func: addToCartOnPage,
            args: [line.quantity],
          })
          outcome = result?.result
        } catch {
          await sleep(PAUSE_MS)
        }
      }
      if (outcome?.blocked) {
        job.stopped = BLOCKED
        break
      }
      if (outcome?.ok) {
        job.added.push({ name: line.name, quantity: outcome.quantity })
        sent.push({ itemId: line.itemId, packages: line.quantity })
      } else {
        job.skipped.push({
          name: line.name,
          reason: outcome?.reason ?? "It didn't work",
        })
      }
      job.done++
      await setJob(job)
      await sleep(PAUSE_MS)
    }
  } catch (error) {
    job.stopped = (error as Error).message
  }
  if (sent.length) {
    await mise("/shop/walmart/sent", { body: { lines: sent } }).catch(() => {})
  }
  job.running = false
  job.current = null
  await setJob(job)
}
