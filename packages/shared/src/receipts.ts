import { z } from "zod"

/** What a receipt line is: food goes in the pantry, the rest doesn't. */
export const RECEIPT_KINDS = ["food", "household", "other"] as const
export type ReceiptKind = (typeof RECEIPT_KINDS)[number]

/** A line from a receipt, as Nourvio read it. */
export type ReceiptItem = {
  id: string
  /** As printed: "GV WHL MLK 1GAL". */
  text: string
  /** What it is: "whole milk". */
  name: string
  /** "1 gal", "2 lb", or null. */
  amount: string | null
  price: number | null
  kind: ReceiptKind
  /** The shopping list item it was bought for, taken off when it's added. */
  listItem: { id: string; name: string } | null
}

/** A receipt read and waiting for a look before anything is added. */
export type ReceiptDraft = {
  id: string
  store: string | null
  /** The day on the receipt, "2026-10-14". */
  date: string | null
  items: ReceiptItem[]
  total: number | null
}

/** What happened when a receipt's items were added. */
export type ReceiptAdded = { added: number; offTheList: number }

export const addReceiptInput = z.object({
  items: z
    .array(
      z.object({
        id: z.string().min(1).max(40),
        name: z.string().trim().min(1, "Name it").max(200),
        amount: z.string().trim().max(60).nullable(),
      })
    )
    .min(1, "Pick something to add")
    .max(300),
})
export type AddReceiptInput = z.infer<typeof addReceiptInput>

export const receiptTextInput = z.object({
  text: z.string().trim().min(10, "Paste the receipt's text").max(50_000),
})
