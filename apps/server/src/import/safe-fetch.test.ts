import { describe, expect, test } from "vitest"

import { fetchPublic, isBlockedAddress } from "./safe-fetch.ts"

describe("isBlockedAddress", () => {
  test.each([
    "127.0.0.1",
    "10.1.2.3",
    "172.16.0.5",
    "192.168.1.10",
    "169.254.169.254",
    "100.64.0.1",
    "0.0.0.0",
    "::1",
    "fe80::1",
    "fd12:3456::1",
    "::ffff:192.168.1.1",
    "::ffff:7f00:1",
    "not-an-ip",
  ])("blocks %s", (address) => {
    expect(isBlockedAddress(address)).toBe(true)
  })

  test.each(["8.8.8.8", "151.101.1.69", "2606:4700::6810:84e5"])(
    "allows %s",
    (address) => {
      expect(isBlockedAddress(address)).toBe(false)
    }
  )
})

describe("fetchPublic", () => {
  test("refuses links to private addresses without connecting", async () => {
    await expect(fetchPublic("http://192.168.1.1/admin")).rejects.toMatchObject(
      {
        status: 400,
      }
    )
    await expect(fetchPublic("http://[::1]:3000/")).rejects.toMatchObject({
      status: 400,
    })
  })

  test("refuses names that resolve to private addresses", async () => {
    await expect(fetchPublic("http://localhost:3999/")).rejects.toMatchObject({
      status: 400,
      message: "That link points at a private network address",
    })
  })

  test("refuses other schemes", async () => {
    await expect(fetchPublic("file:///etc/passwd")).rejects.toMatchObject({
      status: 400,
    })
    await expect(fetchPublic("not a url")).rejects.toMatchObject({
      status: 400,
    })
  })
})
