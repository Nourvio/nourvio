import type {
  PantryItem,
  ReceiptAdded,
  ReceiptDraft,
  ShoppingItem,
} from "@mise/shared"
import sharp from "sharp"
import { afterAll, beforeAll, describe, expect, test } from "vitest"

import type { AiProviderFactory } from "../ai/types.ts"
import { apiClient, createTestAppWithAdmin } from "../test/helpers.ts"

/** A tiny PDF with one line of text, like an emailed receipt saved as PDF. */
function receiptPdf(line: string) {
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 144] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${line.length + 30} >>\nstream\nBT /F1 12 Tf 20 100 Td (${line}) Tj ET\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ]
  let body = "%PDF-1.4\n"
  const offsets: number[] = []
  objects.forEach((object, index) => {
    offsets.push(body.length)
    body += `${index + 1} 0 obj\n${object}\nendobj\n`
  })
  const xref = body.length
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  for (const offset of offsets) {
    body += `${String(offset).padStart(10, "0")} 00000 n \n`
  }
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return Buffer.from(body, "latin1")
}

describe("receipts into the pantry", () => {
  let t: Awaited<ReturnType<typeof createTestAppWithAdmin>>
  const asked: { images: number; text: string }[] = []

  const aiFactory: AiProviderFactory = (id) => ({
    id,
    async extract(request) {
      asked.push({
        images: request.parts.filter((p) => p.type === "image").length,
        text: request.parts
          .map((p) => (p.type === "text" ? p.text : ""))
          .join(""),
      })
      return {
        data: {
          store: "Walmart",
          date: "2026-10-14",
          total: 17.46,
          items: [
            {
              text: "GV WHL MLK 1GAL",
              name: "whole milk",
              amount: "1 gal",
              price: 3.49,
              kind: "food",
            },
            {
              text: "BNLS SKNLS CHKN THGH",
              name: "boneless skinless chicken thighs",
              amount: "2.3 lb",
              price: 8.97,
              kind: "food",
            },
            {
              text: "PAPER TOWELS 6PK",
              name: "paper towels",
              amount: "6 ct",
              price: 5,
              kind: "household",
            },
          ],
        },
        usage: { inputTokens: 900, outputTokens: 200 },
      } as never
    },
    async listModels() {
      return []
    },
  })

  beforeAll(async () => {
    t = await createTestAppWithAdmin({ aiFactory })
    await t.admin.put("/api/ai/settings", {
      keys: { anthropic: "sk-ant-test-key-1234" },
    })
    await t.admin.post("/api/list/items", { text: "1 gallon milk" })
    await t.admin.post("/api/list/items", { text: "bananas" })
  })
  afterAll(() => t.close())

  test("a photo of the receipt is read into a draft to look over", async () => {
    // A long screenshot, like an emailed receipt, is cut into tiles to read.
    const tall = await sharp({
      create: { width: 600, height: 3000, channels: 3, background: "#fff" },
    })
      .png()
      .toBuffer()
    const res = await t.admin.upload(
      "/api/receipts",
      "file",
      new File([tall], "receipt.png", { type: "image/png" })
    )
    expect(res.status).toBe(201)
    expect(asked.at(-1)!.images).toBeGreaterThan(2)
    const draft = res.body.draft as ReceiptDraft
    expect(draft).toMatchObject({ store: "Walmart", date: "2026-10-14" })
    expect(res.body.url).toMatch(
      new RegExp(`/pantry/receipt\\?id=${draft.id}$`)
    )
    // Milk is on the list, so it'll come off; the rest isn't.
    expect(
      draft.items.map((item) => [item.name, item.listItem?.name ?? null])
    ).toEqual([
      ["whole milk", "milk"],
      ["boneless skinless chicken thighs", null],
      ["paper towels", null],
    ])
    expect((await t.admin.get(`/api/receipts/${draft.id}`)).status).toBe(200)
  })

  test("adding puts food in the pantry and takes it off the list", async () => {
    const draft = (
      await t.admin.post("/api/receipts", {
        text: "WALMART\nGV WHL MLK 1GAL 3.49\nTOTAL 17.46",
      })
    ).body.draft as ReceiptDraft
    expect(asked.at(-1)!.text).toContain("GV WHL MLK")
    const food = draft.items.filter((item) => item.kind === "food")
    const res = await t.admin.post(`/api/receipts/${draft.id}/add`, {
      items: food.map(({ id, name, amount }) => ({ id, name, amount })),
    })
    expect(res.body as ReceiptAdded).toEqual({ added: 2, offTheList: 1 })
    const pantry = (await t.admin.get("/api/pantry")).body.items as PantryItem[]
    expect(pantry.map((item) => item.name).sort()).toEqual([
      "boneless skinless chicken thighs",
      "whole milk",
    ])
    const list = (await t.admin.get("/api/list")).body.items as ShoppingItem[]
    expect(list.map((item) => item.name)).toEqual(["bananas"])
    // Used up: it can't be added twice.
    expect((await t.admin.get(`/api/receipts/${draft.id}`)).status).toBe(404)
  })

  test("an iPhone Shortcut sends a PDF with a key, no browser involved", async () => {
    const { token } = (
      await t.admin.post("/api/extension/tokens", { name: "iPhone Shortcut" })
    ).body as { token: string }
    const form = new FormData()
    form.append(
      "file",
      new File([receiptPdf("GV WHL MLK 1GAL 3.49")], "receipt.pdf", {
        type: "application/pdf",
      })
    )
    // No Origin header, as a Shortcut sends it: the key is enough.
    const res = await t.app.request("/api/receipts", {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
      body: form,
    })
    expect(res.status).toBe(201)
    expect(asked.at(-1)!.text).toContain("GV WHL MLK 1GAL 3.49")
    // Without a key, a form post from nowhere is still refused.
    const anon = await t.app.request("/api/receipts", {
      method: "POST",
      body: form,
    })
    expect(anon.status).toBe(403)
  })

  test("another household can't see or add someone's receipt", async () => {
    const draft = (
      await t.admin.post("/api/receipts", { text: "WALMART\nMILK 3.49" })
    ).body.draft as ReceiptDraft
    await t.admin.put("/api/server/settings", { signupOpen: true })
    const neighbor = apiClient(t.app)
    await neighbor.post("/api/signup", {
      householdName: "Next Door",
      displayName: "Dana",
      username: "dana",
      password: "correct horse battery",
    })
    expect((await neighbor.get(`/api/receipts/${draft.id}`)).status).toBe(404)
    expect(
      (
        await neighbor.post(`/api/receipts/${draft.id}/add`, {
          items: [{ id: draft.items[0]!.id, name: "milk", amount: null }],
        })
      ).status
    ).toBe(404)
    expect((await t.admin.get(`/api/receipts/${draft.id}`)).status).toBe(200)
  })
})
