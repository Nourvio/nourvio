import { describe, expect, test } from "vitest"
import { loadConfig } from "./config.ts"

describe("settings", () => {
  test("nothing needs setting", () => {
    const config = loadConfig({})

    expect(config.port).toBe(3000)
    expect(config.logLevel).toBe("info")
    expect(config.version).toMatch(/^\d+\.\d+\.\d+/)
  })

  test("an empty variable counts as not set", () => {
    expect(loadConfig({ PORT: "" }).port).toBe(3000)
  })

  test("values are read and checked", () => {
    const config = loadConfig({
      PORT: "8080",
      MERRAN_LOG_LEVEL: "debug",
      MERRAN_LOG_FORMAT: "json",
    })

    expect(config).toMatchObject({
      port: 8080,
      logLevel: "debug",
      logFormat: "json",
    })
  })

  test("everything wrong is listed at once", () => {
    expect(() =>
      loadConfig({ PORT: "eighty", MERRAN_LOG_LEVEL: "loud" })
    ).toThrow(/PORT[\s\S]*MERRAN_LOG_LEVEL/)
  })
})
