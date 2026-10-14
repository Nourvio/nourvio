import { describe, expect, test } from "vitest"

import { HttpError } from "../http.ts"
import { findFeed, isFeed, parseFeed } from "./feeds.ts"
import type { Fetcher } from "./safe-fetch.ts"

const RSS = `<?xml version="1.0" encoding="UTF-8"?>
<?xml-stylesheet type="text/xsl" href="/feed.xsl"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:media="http://search.yahoo.com/mrss/">
<channel>
  <title>Cook Example – Easy recipes for home cooks</title>
  <link>https://cook.example/</link>
  <item>
    <title>Tomato Soup &amp; Grilled Cheese</title>
    <link>https://cook.example/tomato-soup/?utm_source=rss</link>
    <pubDate>Mon, 12 Oct 2026 05:00:00 +0000</pubDate>
    <media:content url="https://cook.example/soup.jpg" medium="image" />
  </item>
  <item>
    <title>Beef Stew</title>
    <link>https://cook.example/beef-stew/</link>
    <pubDate>Sun, 11 Oct 2026 05:00:00 +0000</pubDate>
    <content:encoded><![CDATA[<p><img src="https://cook.example/pixel.gif" width="1"><img src="/stew.jpg" width="1200"></p>]]></content:encoded>
  </item>
  <item>
    <title>No link here</title>
  </item>
</channel>
</rss>`

const ATOM = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Atom Kitchen</title>
  <link href="https://atom.example/feed.xml" rel="self"/>
  <link href="https://atom.example/"/>
  <entry>
    <title>Lemon Bars</title>
    <link rel="alternate" href="https://atom.example/lemon-bars"/>
    <published>2026-10-01T10:00:00Z</published>
    <summary type="html">&lt;img src="https://atom.example/bars.jpg"&gt;</summary>
  </entry>
</feed>`

describe("reading feeds", () => {
  test("RSS: links without tracking, dates, and photos from media tags or the post", () => {
    expect(isFeed(RSS)).toBe(true)
    expect(isFeed("<!doctype html><html></html>")).toBe(false)
    const feed = parseFeed(RSS, "https://cook.example/feed/")
    expect(feed.title).toBe("Cook Example – Easy recipes for home cooks")
    expect(feed.siteUrl).toBe("https://cook.example/")
    expect(feed.items).toEqual([
      {
        url: "https://cook.example/tomato-soup/",
        title: "Tomato Soup & Grilled Cheese",
        image: "https://cook.example/soup.jpg",
        publishedAt: "2026-10-12T05:00:00.000Z",
      },
      {
        url: "https://cook.example/beef-stew/",
        title: "Beef Stew",
        image: "https://cook.example/stew.jpg",
        publishedAt: "2026-10-11T05:00:00.000Z",
      },
    ])
  })

  test("Atom", () => {
    const feed = parseFeed(ATOM, "https://atom.example/feed.xml")
    expect(feed.title).toBe("Atom Kitchen")
    expect(feed.siteUrl).toBe("https://atom.example/")
    expect(feed.items).toEqual([
      {
        url: "https://atom.example/lemon-bars",
        title: "Lemon Bars",
        image: "https://atom.example/bars.jpg",
        publishedAt: "2026-10-01T10:00:00.000Z",
      },
    ])
  })
})

describe("finding a site's feed", () => {
  const page = (body: string, url: string) => ({
    url,
    contentType: "text/html",
    body: Buffer.from(body),
  })

  test("from the feed the page links to, not its comments feed", async () => {
    const fetched: string[] = []
    const fetcher: Fetcher = async (url) => {
      fetched.push(url)
      if (url === "https://cook.example/") {
        return page(
          `<html><head>
            <link rel="alternate" type="application/rss+xml" href="/comments/feed/">
            <link rel="alternate" type="application/rss+xml" href="/feed/">
          </head></html>`,
          url
        )
      }
      if (url === "https://cook.example/feed/") return page(RSS, url)
      throw new Error(`Unexpected ${url}`)
    }
    const found = await findFeed(fetcher, "cook.example")
    expect(found.feedUrl).toBe("https://cook.example/feed/")
    expect(found.feed.items).toHaveLength(2)
    expect(fetched).toEqual([
      "https://cook.example/",
      "https://cook.example/feed/",
    ])
  })

  test("from the feed itself, or /feed/ when the home page turns Mise away", async () => {
    const direct: Fetcher = async (url) => page(ATOM, url)
    expect(
      (await findFeed(direct, "https://atom.example/feed.xml")).feedUrl
    ).toBe("https://atom.example/feed.xml")

    const guarded: Fetcher = async (url) => {
      if (url === "https://cook.example/feed/") return page(RSS, url)
      throw new HttpError(502, "Blocked")
    }
    expect((await findFeed(guarded, "https://cook.example/")).feedUrl).toBe(
      "https://cook.example/feed/"
    )
  })

  test("says when there isn't one", async () => {
    const none: Fetcher = async (url) => {
      if (url.endsWith("/feed/") || url.endsWith("/rss.xml")) {
        throw new HttpError(404, "Not found")
      }
      return page("<html><head></head></html>", url)
    }
    await expect(findFeed(none, "https://plain.example")).rejects.toThrow(
      /couldn't find a feed/
    )
  })
})
