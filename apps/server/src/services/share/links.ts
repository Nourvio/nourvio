// Finding the link in what's shared to Merran. Android's share sheet sends a
// link as text, often with a line around it ("Check this out! https://…").
// An iPhone Shortcut may send it as text, as a file with the address in it,
// as a .webloc, or as the web page itself, whose own address it carries.

/** A file that came with a share. */
export type SharedFile = { body: Buffer; type: string; name: string }

/** What came through a share: its files, and its text. */
export type Shared = { files: SharedFile[]; text: string | null }

/** Text files are read for a link up to this size. */
const MAX_TEXT_FILE = 2_000_000

/** Words around links, beyond which it's a text that mentions sites, not links. */
const MAX_AROUND = 300

/** Every web link in some text, each once, without the punctuation after it. */
export function findLinks(text: string) {
  const links: string[] = []
  for (const raw of text.match(/https?:\/\/[^\s<>"'()[\]]+/g) ?? []) {
    const link = raw.replace(/[).,;:!?]+$/, "")
    if (!links.includes(link)) links.push(link)
  }
  return links
}

/**
 * The links in shared text, when sharing them is the point: a link or a few,
 * with a line of text at most. A long text that happens to mention sites,
 * like an email, isn't links.
 */
export function linksInText(text: string | null | undefined) {
  if (!text) return []
  const links = findLinks(text)
  if (links.length === 0) return []
  const around = links
    .reduce((rest, link) => rest.split(link).join(""), text)
    .replace(/\s+/g, " ")
    .trim()
  return around.length <= MAX_AROUND ? links : []
}

const isPdf = (file: SharedFile) =>
  file.type === "application/pdf" ||
  file.body.subarray(0, 5).toString() === "%PDF-"

/**
 * Whether a file is really text: a Shortcut turns a shared link into a text
 * file, a .webloc or the web page itself, sometimes with no type at all.
 * Photos and PDFs aren't.
 */
function isTextLike(file: SharedFile) {
  if (isPdf(file) || file.body.length > MAX_TEXT_FILE) return false
  if (
    file.type.startsWith("text/") ||
    /url|uri|xml|json|webloc|internet-shortcut/.test(file.type)
  ) {
    return true
  }
  if (file.type && file.type !== "application/octet-stream") return false
  return !file.body.subarray(0, 4096).includes(0)
}

const isHtml = (text: string) =>
  /^\s*(<!doctype html|<html|<head)/i.test(text.slice(0, 1000))

const unescapeHtml = (text: string) => text.replace(/&amp;/g, "&")

/** A web page's own address: its canonical link, else its og:url. */
function pageAddress(html: string) {
  for (const tag of html.match(/<(?:link|meta)\b[^>]*>/gi) ?? []) {
    const attribute = (name: string) =>
      tag.match(new RegExp(`\\b${name}\\s*=\\s*["']([^"']+)["']`, "i"))?.[1]
    const isPage =
      /^canonical$/i.test(attribute("rel") ?? "") ||
      /^og:url$/i.test(attribute("property") ?? "")
    const value = attribute("href") ?? attribute("content")
    if (isPage && value && /^https?:\/\//i.test(value)) {
      return unescapeHtml(value)
    }
  }
  return null
}

/** The link in a .webloc (Apple) or .url (Windows) shortcut file. */
function shortcutLink(text: string) {
  const plist = text.match(
    /<key>\s*URL\s*<\/key>\s*<string>\s*(https?:\/\/[^<\s]+)\s*<\/string>/i
  )
  if (plist) return unescapeHtml(plist[1]!)
  return text.match(/^\s*URL\s*=\s*(https?:\/\/\S+)/im)?.[1] ?? null
}

/**
 * The links in a share, when links are the point. The files win over the
 * text, which is often the same link again; a photo that comes along is the
 * link's preview. A PDF means it isn't links.
 */
export function sharedLinks(shared: Shared) {
  if (shared.files.some(isPdf)) return []
  const fromFiles = shared.files.filter(isTextLike).flatMap((file) => {
    const content = file.body.toString("utf8")
    if (isHtml(content)) {
      const address = pageAddress(content)
      return address ? [address] : []
    }
    const shortcut = shortcutLink(content)
    return shortcut ? [shortcut] : linksInText(content)
  })
  return [
    ...new Set(fromFiles.length > 0 ? fromFiles : linksInText(shared.text)),
  ]
}
