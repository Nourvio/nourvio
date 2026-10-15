import { describe, expect, it } from "vitest"

import { changesTheApp, parseBuildContext } from "./updates.ts"

describe("parseBuildContext", () => {
  it("follows a GitHub branch, main when none is given", () => {
    expect(
      parseBuildContext("https://github.com/Nourvio/nourvio.git#main")
    ).toEqual({
      kind: "branch",
      owner: "Nourvio",
      repo: "nourvio",
      branch: "main",
    })
    expect(parseBuildContext("https://github.com/someone/mise-fork")).toEqual({
      kind: "branch",
      owner: "someone",
      repo: "mise-fork",
      branch: "main",
    })
    expect(
      parseBuildContext("https://github.com/a/mise.git#dev/next:apps")
    ).toMatchObject({ kind: "branch", branch: "dev/next" })
  })

  it("can't follow a tag, a commit or a local folder", () => {
    expect(
      parseBuildContext("https://github.com/Nourvio/nourvio.git#v0.1.0")
    ).toEqual({ kind: "pinned", ref: "v0.1.0" })
    expect(
      parseBuildContext("https://github.com/Nourvio/nourvio.git#5f92224")
    ).toEqual({ kind: "pinned", ref: "5f92224" })
    expect(parseBuildContext(".")).toBeNull()
    expect(parseBuildContext("D:/Development/Nourvio")).toBeNull()
    expect(parseBuildContext(undefined)).toBeNull()
  })
})

describe("changesTheApp", () => {
  it("ignores docs, tests and other files the image leaves out", () => {
    expect(
      changesTheApp([
        "docs/roadmap.md",
        "README.md",
        ".github/workflows/ci.yml",
        "apps/server/src/routes/sales.test.ts",
      ])
    ).toBe(false)
    expect(changesTheApp(["docs/roadmap.md", "apps/web/src/main.tsx"])).toBe(
      true
    )
    expect(changesTheApp(["compose.yaml"])).toBe(true)
  })
})
