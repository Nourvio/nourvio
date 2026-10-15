import { randomUUID } from "node:crypto"

import { sharedLink, type ShareResult } from "@mise/shared"

import type { AiActor, AiService } from "../ai/service.ts"
import type { AiPart } from "../ai/types.ts"
import type { Db } from "../db/client.ts"
import { HttpError } from "../http.ts"
import { extractRecipe, photosToParts } from "../import/ai-extract.ts"
import type { AfterImport } from "./import-follow-up.ts"
import {
  isPdf,
  pdfText,
  plainText,
  type ReceiptFiles,
  type ReceiptService,
} from "./receipts.ts"
import { createRecipe } from "./recipes.ts"

/** Text-like files are read for a link up to this size. */
const MAX_TEXT_FILE = 2 * 1024 * 1024

/**
 * Whether a shared file is really text: a Shortcut turns a shared link into
 * a file, a text file with the address or the web page itself, sometimes
 * with no type at all. Pictures and PDFs aren't.
 */
function isTextLike(file: ReceiptFiles[number]) {
  if (isPdf(file) || file.buffer.length > MAX_TEXT_FILE) return false
  if (
    file.type.startsWith("text/") ||
    /url|uri|xml|json|webloc|internet-shortcut/.test(file.type)
  ) {
    return true
  }
  if (file.type && file.type !== "application/octet-stream") return false
  return !file.buffer.subarray(0, 4096).includes(0)
}

/** A web page's own address: its canonical link, else its og:url. */
function pageAddress(html: string) {
  for (const tag of html.match(/<(link|meta)\b[^>]*>/gi) ?? []) {
    const attr = (name: string) =>
      tag.match(new RegExp(`\\b${name}\\s*=\\s*["']([^"']+)["']`, "i"))?.[1]
    const isPage =
      /^canonical$/i.test(attr("rel") ?? "") ||
      /^og:url$/i.test(attr("property") ?? "")
    const value = attr("href") ?? attr("content")
    if (isPage && value && /^https?:\/\//i.test(value)) {
      return value.replace(/&amp;/g, "&")
    }
  }
  return null
}

const isHtml = (text: string) =>
  /^\s*(<!doctype html|<html|<head)/i.test(text.slice(0, 1000))

/**
 * The link in a share, when sharing a link is the point: in the text, or in
 * the files a Shortcut made of it (a text file with the address, a .webloc,
 * or the web page itself, whose own address it carries). A picture that
 * comes along is the link's preview; a PDF, or only a long text like a
 * receipt, means it isn't a link.
 */
export function linkIn(shared: { files: ReceiptFiles; text: string | null }) {
  if (shared.files.some(isPdf)) return null
  for (const file of shared.files.filter(isTextLike)) {
    const content = file.buffer.toString("utf8")
    const found = isHtml(content) ? pageAddress(content) : sharedLink(content)
    if (found) return found
  }
  return sharedLink(shared.text)
}

/** What came through, for "Mise couldn't tell what that was". */
function described(shared: { files: ReceiptFiles; text: string | null }) {
  const kinds = shared.files.map((file) =>
    isPdf(file)
      ? "a PDF"
      : file.type.startsWith("image/")
        ? "an image"
        : isTextLike(file)
          ? isHtml(file.buffer.toString("utf8", 0, 1000))
            ? "a web page"
            : "a text file"
          : `a file (${file.type || "no type"})`
  )
  if (shared.text) kinds.push("some text")
  return [...new Set(kinds)].join(" and ") || "nothing"
}

/** Something shared waits this long for Mise to open and deal with it. */
const KEEP_MS = 30 * 60_000
/** Recipe photos read at once, as the photo import allows. */
const MAX_RECIPE_PHOTOS = 4

type Actor = AiActor & { userId: string; householdId: string }

/**
 * Anything shared into Mise (from an iPhone Shortcut, or Android's share
 * sheet): kept for a moment, then worked out when Mise opens. A link is
 * imported as a recipe, a receipt goes to its review, and photos or text
 * of a recipe become one.
 */
export function createShareService(
  db: Db,
  ai: AiService,
  receipts: ReceiptService,
  afterImport: AfterImport
) {
  const waiting = new Map<
    string,
    {
      householdId: string
      files: ReceiptFiles
      text: string | null
      expires: number
    }
  >()

  function forget() {
    const now = Date.now()
    for (const [id, kept] of waiting) if (kept.expires < now) waiting.delete(id)
  }

  /** Keeps what was shared until Mise opens it; returns its id. */
  function keep(
    householdId: string,
    shared: { files: ReceiptFiles; text: string | null }
  ) {
    forget()
    const id = randomUUID()
    waiting.set(id, { householdId, ...shared, expires: Date.now() + KEEP_MS })
    return id
  }

  /** A recipe from shared photos, a PDF or text. */
  async function importRecipe(
    actor: Actor,
    files: ReceiptFiles,
    text: string | null
  ) {
    const photos = files.filter(
      (file) => !isPdf(file) && !file.type.startsWith("text/")
    )
    const texts = [
      ...(await Promise.all(
        files.filter(isPdf).map((file) => pdfText(file.buffer))
      )),
      ...files
        .filter((file) => file.type.startsWith("text/"))
        .map((file) => plainText(file.buffer.toString("utf8"))),
      ...(text ? [plainText(text)] : []),
    ].filter(Boolean)
    const parts: AiPart[] = photos.length
      ? await photosToParts(
          photos.slice(0, MAX_RECIPE_PHOTOS).map((file) => file.buffer)
        )
      : []
    if (texts.length) parts.push({ type: "text", text: texts.join("\n\n") })
    const input = await extractRecipe(ai, actor, parts)
    const recipe = await createRecipe(db, actor.householdId, input, {
      origin: photos.length ? "photo" : "text",
      userId: actor.userId,
    })
    await afterImport({ recipe, duplicate: false }, actor)
    return recipe
  }

  /** Works out what was shared and deals with it. */
  async function open(actor: Actor, id: string): Promise<ShareResult> {
    forget()
    const kept = waiting.get(id)
    if (!kept || kept.householdId !== actor.householdId) {
      throw new HttpError(
        404,
        "That share isn't waiting any more. Share it again."
      )
    }
    waiting.delete(id)
    const link = linkIn(kept)
    if (link) return { kind: "link", link }

    const { draft, what } = await receipts.read(actor, kept)
    if (what === "recipe") {
      const recipe = await importRecipe(actor, kept.files, kept.text)
      return { kind: "recipe", slug: recipe.slug, name: recipe.name }
    }
    if (what === "receipt" || draft.items.length) {
      return { kind: "receipt", id: draft.id }
    }
    return { kind: "unknown", got: described(kept) }
  }

  return { keep, open }
}

export type ShareService = ReturnType<typeof createShareService>
