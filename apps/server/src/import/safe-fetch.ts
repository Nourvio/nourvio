import { lookup } from "node:dns"
import { BlockList, isIP } from "node:net"

import { Agent, fetch } from "undici"

import { HttpError } from "../http.ts"

/**
 * Addresses a public fetch must never reach: loopback, private networks,
 * link-local, carrier NAT, multicast and the like. This stops the import
 * feature from being used to poke at machines on the home network.
 */
const blocked = new BlockList()
for (const [network, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const) {
  blocked.addSubnet(network, prefix, "ipv4")
}
for (const [network, prefix] of [
  ["::", 128],
  ["::1", 128],
  ["64:ff9b::", 96],
  ["fc00::", 7],
  ["fe80::", 10],
  ["ff00::", 8],
] as const) {
  blocked.addSubnet(network, prefix, "ipv6")
}

export function isBlockedAddress(address: string) {
  const family = isIP(address)
  if (!family) return true
  // IPv4-mapped IPv6 (::ffff:10.0.0.1). Public DNS never hands these out, and
  // BlockList can't hold the range without also matching every IPv4 address.
  if (family === 6 && /^::ffff:/i.test(address)) return true
  return blocked.check(address, family === 6 ? "ipv6" : "ipv4")
}

/**
 * Cipher order like a current browser's. Some big recipe sites (Allrecipes,
 * Simply Recipes) refuse Node's default TLS handshake but accept this,
 * together with HTTP/2.
 */
const BROWSER_CIPHERS = [
  "TLS_AES_128_GCM_SHA256",
  "TLS_AES_256_GCM_SHA384",
  "TLS_CHACHA20_POLY1305_SHA256",
  "ECDHE-ECDSA-AES128-GCM-SHA256",
  "ECDHE-RSA-AES128-GCM-SHA256",
  "ECDHE-ECDSA-AES256-GCM-SHA384",
  "ECDHE-RSA-AES256-GCM-SHA384",
  "ECDHE-ECDSA-CHACHA20-POLY1305",
  "ECDHE-RSA-CHACHA20-POLY1305",
  "ECDHE-RSA-AES128-SHA",
  "ECDHE-RSA-AES256-SHA",
  "AES128-GCM-SHA256",
  "AES256-GCM-SHA384",
  "AES128-SHA",
  "AES256-SHA",
].join(":")

/** Resolves names itself and refuses to connect to blocked addresses. */
const publicAgent = new Agent({
  allowH2: true,
  connect: {
    ciphers: BROWSER_CIPHERS,
    lookup(hostname, options, callback) {
      lookup(hostname, { all: true }, (error, addresses) => {
        if (error) return callback(error, "", 4)
        const allowed = addresses.filter((a) => !isBlockedAddress(a.address))
        if (!allowed.length) {
          return callback(
            Object.assign(new Error(`${hostname} is a private address`), {
              code: "EBLOCKED",
            }),
            "",
            4
          )
        }
        if (options.all) return callback(null, allowed as never, 4)
        callback(null, allowed[0]!.address, allowed[0]!.family)
      })
    },
  },
})

const BROWSER_HEADERS = {
  "user-agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36",
  "accept-language": "en-US,en;q=0.9",
}

export type FetchedResource = {
  url: string
  contentType: string
  body: Buffer
}

export type Fetcher = (
  url: string,
  options?: { accept?: string; maxBytes?: number }
) => Promise<FetchedResource>

function checkUrl(raw: string) {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw new HttpError(400, "That doesn't look like a link")
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new HttpError(400, "Only http and https links can be imported")
  }
  const host = url.hostname.replace(/^\[|\]$/g, "")
  if (isIP(host) && isBlockedAddress(host)) {
    throw new HttpError(400, "That link points at a private network address")
  }
  return url
}

/**
 * Fetches a public web page or image, following up to 5 redirects and
 * checking every hop. Gives up after 15 seconds or `maxBytes`.
 */
export const fetchPublic: Fetcher = async (
  raw,
  {
    accept = "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    maxBytes = 5_000_000,
  } = {}
) => {
  let url = checkUrl(raw)
  const signal = AbortSignal.timeout(15_000)

  for (let hop = 0; hop <= 5; hop++) {
    let response
    try {
      response = await fetch(url, {
        dispatcher: publicAgent,
        redirect: "manual",
        signal,
        headers: { ...BROWSER_HEADERS, accept },
      })
    } catch (error) {
      const code = (error as { cause?: { code?: string } }).cause?.code
      if (code === "EBLOCKED") {
        throw new HttpError(
          400,
          "That link points at a private network address"
        )
      }
      if ((error as Error).name === "TimeoutError") {
        throw new HttpError(504, "That site took too long to answer")
      }
      throw new HttpError(502, "Couldn't reach that site")
    }

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location")
      await response.body?.cancel()
      if (!location)
        throw new HttpError(502, "That site sent a broken redirect")
      url = checkUrl(new URL(location, url).toString())
      continue
    }
    if (!response.ok) {
      await response.body?.cancel()
      throw new HttpError(
        502,
        response.status === 403 || response.status === 429
          ? "That site blocked the request. Try pasting the recipe text instead."
          : `That site answered with an error (${response.status})`
      )
    }

    const chunks: Buffer[] = []
    let size = 0
    for await (const chunk of response.body ?? []) {
      size += chunk.length
      if (size > maxBytes) {
        throw new HttpError(413, "That page is too large to import")
      }
      chunks.push(Buffer.from(chunk))
    }
    return {
      url: url.toString(),
      contentType: response.headers.get("content-type") ?? "",
      body: Buffer.concat(chunks),
    }
  }
  throw new HttpError(502, "That link redirects too many times")
}
