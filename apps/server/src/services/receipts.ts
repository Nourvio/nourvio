import { randomUUID } from "node:crypto"

import {
  foodKey,
  type AddReceiptInput,
  type ReceiptAdded,
  type ReceiptDraft,
} from "@mise/shared"
import sharp, { type Sharp } from "sharp"
import { extractText, getDocumentProxy } from "unpdf"
import { z } from "zod"

import type { AiActor, AiService } from "../ai/service.ts"
import type { AiPart } from "../ai/types.ts"
import type { Db } from "../db/client.ts"
import { HttpError } from "../http.ts"
import { deleteItem, listRows } from "./list.ts"
import { addPantryItem } from "./pantry.ts"

/** Up to this many files a receipt. */
const MAX_FILES = 6
/** Tiles cut from one tall screenshot, at most. */
const MAX_TILES = 8
/** A receipt waits this long for its look before it's forgotten. */
const KEEP_MS = 60 * 60_000

const RECEIPT_SYSTEM = `You read grocery receipts: photos, screenshots, or the text of an emailed receipt. List what was bought.
- One entry per product line. Skip totals, subtotals, tax, payment, change, coupons, discounts, bag fees, deposits and loyalty lines.
- "text" is the line as printed. "name" is the plain grocery name a home cook would write on a list: "GV WHL MLK 1GAL" is "whole milk", "BNLS SKNLS CHKN THGH" is "boneless skinless chicken thighs". Leave brands out unless they're the point (Diet Pepsi).
- "amount" is how much, as a cook would say it: "1 gal", "2.3 lb", "12 ct", "2" for two of something; null when the receipt doesn't say.
- "price" is what was paid for that line, after any discount on it; null if unclear.
- "kind": "food" for anything eaten or drunk (soda too), "household" for paper goods, cleaning, toiletries and the like, "other" for anything else.
- "store" and "date" (YYYY-MM-DD) from the receipt when shown, else null. "total" is the amount paid, else null.
If it isn't a receipt, return no items.`

const receiptSchema = z.object({
  store: z.string().nullable(),
  date: z.string().nullable(),
  total: z.number().nullable(),
  items: z.array(
    z.object({
      text: z.string(),
      name: z.string(),
      amount: z.string().nullable(),
      price: z.number().nullable(),
      kind: z.enum(["food", "household", "other"]),
    })
  ),
})

/** What was shared or uploaded: pictures, PDFs and text. */
export type ReceiptFiles = { buffer: Buffer; type: string }[]

/**
 * A picture for the model to read. A tall screenshot of an emailed receipt
 * is cut into overlapping tiles, so the print stays big enough to read.
 */
async function imageParts(buffer: Buffer): Promise<AiPart[]> {
  let image: Sharp
  let width: number
  let height: number
  try {
    image = sharp(buffer, { failOn: "error" }).rotate()
    const meta = await image.metadata()
    const turned = (meta.orientation ?? 1) >= 5
    width = (turned ? meta.height : meta.width) ?? 0
    height = (turned ? meta.width : meta.height) ?? 0
    if (!width || !height) throw new Error("no size")
  } catch {
    throw new HttpError(400, "One of those files isn't a picture we can read")
  }
  const upright = await image.toBuffer()
  const tileHeight = Math.round(width * 1.4)
  const tiles =
    height > tileHeight * 1.3
      ? Math.min(MAX_TILES, Math.ceil(height / (tileHeight - 80)))
      : 1
  const parts: AiPart[] = []
  for (let i = 0; i < tiles; i++) {
    const top =
      tiles === 1 ? 0 : Math.round(((height - tileHeight) * i) / (tiles - 1))
    const piece = sharp(upright)
    if (tiles > 1) {
      piece.extract({
        left: 0,
        top,
        width,
        height: Math.min(tileHeight, height - top),
      })
    }
    const jpeg = await piece
      .resize({
        width: 1400,
        height: 2000,
        fit: "inside",
        withoutEnlargement: true,
      })
      .jpeg({ quality: 85 })
      .toBuffer()
    parts.push({
      type: "image",
      mediaType: "image/jpeg",
      data: jpeg.toString("base64"),
    })
  }
  return parts
}

async function pdfText(buffer: Buffer) {
  try {
    const pdf = await getDocumentProxy(new Uint8Array(buffer))
    const { text } = await extractText(pdf, { mergePages: true })
    return text.trim()
  } catch {
    throw new HttpError(400, "That PDF couldn't be opened")
  }
}

/** Shared or pasted text: an emailed receipt's, usually with HTML. */
function plainText(text: string) {
  return /<\/?[a-z][^>]*>/i.test(text)
    ? text
        .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, " ")
        .replace(/<br\s*\/?>|<\/(p|div|tr|li|h\d)>/gi, "\n")
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/[ \t]+/g, " ")
        .replace(/\n\s*\n+/g, "\n")
        .trim()
    : text.trim()
}

export function createReceiptService(db: Db, ai: AiService) {
  const drafts = new Map<
    string,
    { householdId: string; draft: ReceiptDraft; expires: number }
  >()

  function forget() {
    const now = Date.now()
    for (const [id, kept] of drafts) if (kept.expires < now) drafts.delete(id)
  }

  /** Reads a receipt into a draft to look over; nothing's added yet. */
  async function read(
    actor: AiActor & { householdId: string },
    input: { files: ReceiptFiles; text: string | null }
  ): Promise<ReceiptDraft> {
    if (input.files.length > MAX_FILES) {
      throw new HttpError(400, `Up to ${MAX_FILES} files a receipt`)
    }
    if (!(await ai.status()).available) {
      throw new HttpError(
        400,
        "Reading receipts needs AI. The server admin can add a key in Settings → AI."
      )
    }
    const parts: AiPart[] = []
    const texts: string[] = []
    for (const file of input.files) {
      if (
        file.type === "application/pdf" ||
        file.buffer.subarray(0, 5).toString() === "%PDF-"
      ) {
        texts.push(await pdfText(file.buffer))
      } else if (file.type.startsWith("text/")) {
        texts.push(plainText(file.buffer.toString("utf8")))
      } else {
        parts.push(...(await imageParts(file.buffer)))
      }
    }
    if (input.text) texts.push(plainText(input.text))
    const text = texts.filter(Boolean).join("\n\n").slice(0, 40_000)
    if (!parts.length && !text) {
      throw new HttpError(
        400,
        "Add a photo, screenshot or PDF of the receipt, or paste its text"
      )
    }
    if (text) parts.push({ type: "text", text: `The receipt:\n\n${text}` })
    else parts.push({ type: "text", text: "Read this receipt." })

    const data = await ai.extract("receipts", actor, {
      system: RECEIPT_SYSTEM,
      parts,
      schema: receiptSchema,
      schemaName: "receipt",
    })

    // What's on the shopping list, to take off once it's bought.
    const waiting = (await listRows(db, actor.householdId)).filter(
      (row) => !row.checked
    )
    const claimed = new Set<string>()
    const draft: ReceiptDraft = {
      id: randomUUID(),
      store: data.store?.trim() || null,
      date: /^\d{4}-\d{2}-\d{2}$/.test(data.date ?? "") ? data.date : null,
      total: data.total,
      items: data.items
        .filter((item) => item.name.trim())
        .map((item) => {
          const key = foodKey(item.name)
          const match =
            item.kind === "food" || item.kind === "household"
              ? waiting.find((row) => {
                  if (claimed.has(row.id)) return false
                  const theirs = foodKey(row.name)
                  return (
                    theirs === key ||
                    key.endsWith(` ${theirs}`) ||
                    theirs.endsWith(` ${key}`)
                  )
                })
              : undefined
          if (match) claimed.add(match.id)
          return {
            id: randomUUID().slice(0, 8),
            text: item.text.trim(),
            name: item.name.trim(),
            amount: item.amount?.trim() || null,
            price: item.price,
            kind: item.kind,
            listItem: match ? { id: match.id, name: match.name } : null,
          }
        }),
    }
    forget()
    drafts.set(draft.id, {
      householdId: actor.householdId,
      draft,
      expires: Date.now() + KEEP_MS,
    })
    return draft
  }

  /** A receipt read earlier (shared from another app, say), still waiting. */
  function get(householdId: string, id: string) {
    forget()
    const kept = drafts.get(id)
    if (!kept || kept.householdId !== householdId) {
      throw new HttpError(
        404,
        "That receipt isn't waiting any more. Share it again."
      )
    }
    return kept.draft
  }

  /** Puts the chosen items in the pantry and takes them off the list. */
  async function add(
    householdId: string,
    id: string,
    input: AddReceiptInput
  ): Promise<ReceiptAdded> {
    const draft = get(householdId, id)
    const byId = new Map(draft.items.map((item) => [item.id, item]))
    let added = 0
    let offTheList = 0
    for (const chosen of input.items) {
      const item = byId.get(chosen.id)
      if (!item) continue
      await addPantryItem(
        db,
        householdId,
        [chosen.amount, chosen.name].filter(Boolean).join(" ")
      )
      added++
      if (item.listItem) {
        try {
          await deleteItem(db, householdId, item.listItem.id)
          offTheList++
        } catch {
          // Already gone from the list.
        }
      }
    }
    drafts.delete(id)
    return { added, offTheList }
  }

  return { read, get, add }
}

export type ReceiptService = ReturnType<typeof createReceiptService>
