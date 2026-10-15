import { load, type CheerioAPI } from "cheerio"

import { HttpError } from "../http.ts"
import { cleanText } from "./jsonld.ts"
import { normalizeUrl } from "./links.ts"
import type { Fetcher } from "./safe-fetch.ts"
import { decodeHtml } from "./url.ts"

/** A post in a site's feed. */
export type FeedItem = {
  url: string
  title: string
  image: string | null
  publishedAt: string | null
}

export type Feed = {
  /** The site's name, from the feed. */
  title: string | null
  /** The site's home page, from the feed. */
  siteUrl: string | null
  items: FeedItem[]
}

/** Newest posts kept from a feed. */
const MAX_ITEMS = 12

const FEED_ACCEPT =
  "application/rss+xml, application/atom+xml, application/xml;q=0.9, text/xml;q=0.9, text/html;q=0.8, */*;q=0.5"

/** Whether a body is an RSS or Atom feed rather than a web page. */
export function isFeed(body: string) {
  return /<(rss|feed|rdf:RDF)[\s>]/i.test(body.slice(0, 3000))
}

function absolute(href: string | undefined, base: string) {
  if (!href?.trim()) return null
  try {
    const url = new URL(href.trim(), base)
    return url.protocol === "http:" || url.protocol === "https:"
      ? url.toString()
      : null
  } catch {
    return null
  }
}

/** The first photo in a post's HTML, skipping tracking pixels and emoji. */
function firstImage(html: string, base: string) {
  if (!html.includes("<img")) return null
  const $ = load(html)
  for (const element of $("img").toArray()) {
    const img = $(element)
    const width = Number(img.attr("width"))
    if (width && width < 100) continue
    const src =
      img.attr("data-src") ??
      img.attr("data-lazy-src") ??
      img.attr("src") ??
      img.attr("srcset")?.split(/\s+/)[0]
    const url = absolute(src, base)
    if (url && !/\.(svg|gif)(\?|$)|emoji|gravatar|pixel/i.test(url)) return url
  }
  return null
}

function date(value: string) {
  const time = Date.parse(value.trim())
  return Number.isNaN(time) ? null : new Date(time).toISOString()
}

/** The photo a feed gives a post: media tags, an image enclosure, or the first in its content. */
function itemImage($: CheerioAPI, item: ReturnType<CheerioAPI>, base: string) {
  const media =
    item
      .find("media\\:content[url]")
      .filter((_, el) => {
        const type = $(el).attr("type") ?? $(el).attr("medium") ?? "image"
        return /image/i.test(type)
      })
      .first()
      .attr("url") ??
    item.find("media\\:thumbnail[url]").first().attr("url") ??
    item
      .find("enclosure[url]")
      .filter((_, el) => /^image\//i.test($(el).attr("type") ?? ""))
      .first()
      .attr("url")
  return (
    absolute(media, base) ??
    firstImage(item.find("content\\:encoded").first().text(), base) ??
    firstImage(item.find("content").first().text(), base) ??
    firstImage(item.find("description, summary").first().text(), base)
  )
}

/** Reads an RSS or Atom feed's newest posts. */
export function parseFeed(xml: string, feedUrl: string): Feed {
  const $ = load(xml, { xml: true })
  const items: FeedItem[] = []
  const seen = new Set<string>()
  const add = (item: FeedItem) => {
    if (seen.has(item.url) || items.length >= MAX_ITEMS) return
    seen.add(item.url)
    items.push(item)
  }

  // RSS (and RSS 1.0's rdf:RDF)
  $("item").each((_, element) => {
    const item = $(element)
    const link =
      absolute(item.children("link").first().text(), feedUrl) ??
      absolute(
        item.children("guid").not('[isPermaLink="false"]').first().text(),
        feedUrl
      )
    const title = cleanText(item.children("title").first().text())
    if (!link || !title) return
    add({
      url: normalizeUrl(link),
      title: title.slice(0, 200),
      image: itemImage($, item, feedUrl),
      publishedAt: date(
        item.children("pubDate").first().text() ||
          item.children("dc\\:date").first().text()
      ),
    })
  })

  // Atom
  $("entry").each((_, element) => {
    const item = $(element)
    const links = item.children("link")
    const href =
      links.filter('[rel="alternate"]').first().attr("href") ??
      links.not("[rel]").first().attr("href") ??
      links.first().attr("href")
    const link = absolute(href, feedUrl)
    const title = cleanText(item.children("title").first().text())
    if (!link || !title) return
    add({
      url: normalizeUrl(link),
      title: title.slice(0, 200),
      image: itemImage($, item, feedUrl),
      publishedAt: date(
        item.children("published").first().text() ||
          item.children("updated").first().text()
      ),
    })
  })

  const channel = $("channel").first()
  const feedTitle = cleanText(
    (channel.length ? channel : $("feed").first())
      .children("title")
      .first()
      .text()
  )
  const siteUrl =
    absolute(channel.children("link").first().text(), feedUrl) ??
    absolute(
      $("feed")
        .first()
        .children('link[rel="alternate"]')
        .first()
        .attr("href") ??
        $("feed").first().children("link").not("[rel]").first().attr("href"),
      feedUrl
    )
  return { title: feedTitle || null, siteUrl, items }
}

async function readFeed(fetcher: Fetcher, url: string) {
  const resource = await fetcher(url, { accept: FEED_ACCEPT })
  const body = decodeHtml(resource.body, resource.contentType)
  return { resource, body }
}

/** Fetches and reads a feed Nourvio already knows the address of. */
export async function fetchFeed(fetcher: Fetcher, feedUrl: string) {
  const { resource, body } = await readFeed(fetcher, feedUrl)
  if (!isFeed(body)) throw new HttpError(422, "That isn't a feed any more")
  return parseFeed(body, resource.url)
}

/**
 * Finds a site's feed from any of its pages (or the feed itself): the feed
 * the page links to, or the usual places (WordPress's /feed/).
 */
export async function findFeed(fetcher: Fetcher, rawUrl: string) {
  const trimmed = rawUrl.trim()
  const url = normalizeUrl(
    /^[a-z]+:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
  )
  const origin = new URL(url).origin
  let page
  try {
    page = await readFeed(fetcher, url)
  } catch {
    // Some sites turn away a server at the front door but not at the feed.
    try {
      const { resource, body } = await readFeed(fetcher, `${origin}/feed/`)
      if (isFeed(body)) {
        const feedUrl = normalizeUrl(resource.url)
        return { feedUrl, feed: parseFeed(body, feedUrl) }
      }
    } catch {
      // Neither opens.
    }
    throw new HttpError(422, "Nourvio couldn't open that site")
  }
  if (isFeed(page.body)) {
    const feedUrl = normalizeUrl(page.resource.url)
    return { feedUrl, feed: parseFeed(page.body, feedUrl) }
  }

  const $ = load(page.body)
  const linked = $('link[rel~="alternate"]')
    .toArray()
    .filter((element) => /(rss|atom)\+xml/i.test($(element).attr("type") ?? ""))
    .map((element) => absolute($(element).attr("href"), page.resource.url))
    .filter((href): href is string => Boolean(href))
    // The site's posts, not a comments feed.
    .sort((a, b) => Number(/comment/i.test(a)) - Number(/comment/i.test(b)))
  const landed = new URL(page.resource.url).origin
  const candidates = [
    ...new Set([...linked, `${landed}/feed/`, `${landed}/rss.xml`]),
  ].slice(0, 4)

  for (const candidate of candidates) {
    try {
      const { resource, body } = await readFeed(fetcher, candidate)
      if (!isFeed(body)) continue
      const feedUrl = normalizeUrl(resource.url)
      const feed = parseFeed(body, feedUrl)
      if (feed.items.length) return { feedUrl, feed }
    } catch {
      // Try the next one.
    }
  }
  throw new HttpError(
    422,
    "Nourvio couldn't find a feed on that site. Not every site has one."
  )
}
