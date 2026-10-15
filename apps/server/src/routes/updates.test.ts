import type { UpdateStatus } from "@mise/shared"
import { describe, expect, test } from "vitest"

import { createUpdateService } from "../services/updates.ts"
import { apiClient, createTestAppWithAdmin } from "../test/helpers.ts"

const BUILT = "2026-10-15T03:40:00Z"

/** GitHub's push history for main, oldest first here. */
const PUSHES = [
  { timestamp: "2026-10-15T03:36:42Z", before: "b600c1e", after: "262ab86" },
  { timestamp: "2026-10-15T03:44:40Z", before: "262ab86", after: "e9be12c" },
  { timestamp: "2026-10-15T04:21:48Z", before: "e9be12c", after: "5f92224" },
]

function fakeGithub(files: string[], calls: string[] = []): typeof fetch {
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    })
  return async (input, init) => {
    const url = new URL(String(input))
    calls.push(`${url.pathname}${url.search}`)
    expect(new Headers(init?.headers).get("user-agent")).toMatch(/^Mise\//)
    if (url.pathname === "/repos/kjohnson2719/mise/activity") {
      return json(
        [...PUSHES]
          .reverse()
          .map((push) => ({ ...push, activity_type: "push" }))
      )
    }
    if (url.pathname === "/repos/kjohnson2719/mise/compare/262ab86...5f92224") {
      return json({
        commits: [
          {
            sha: "e9be12c0000",
            commit: {
              message: "Run Kokoro in the dev stack\n\nMore words.",
              committer: { date: "2026-10-15T03:44:00Z" },
            },
          },
          {
            sha: "5f922240000",
            commit: {
              message: "Lean on Fry's sales",
              committer: { date: "2026-10-15T04:21:00Z" },
            },
          },
        ],
        files: files.map((filename) => ({ filename })),
      })
    }
    return json({ message: "Not Found" }, 404)
  }
}

const status = async (t: Awaited<ReturnType<typeof createTestAppWithAdmin>>) =>
  (await t.admin.get("/api/updates")).body.status as UpdateStatus

describe("update check", () => {
  test("lists what's been pushed since this server was built", async () => {
    const calls: string[] = []
    const t = await createTestAppWithAdmin({
      updates: {
        builtAt: BUILT,
        buildContext: "https://github.com/kjohnson2719/mise.git#main",
        githubFetch: fakeGithub(
          ["apps/web/src/main.tsx", "compose.yaml", "docs/roadmap.md"],
          calls
        ),
      },
    })
    try {
      expect(await status(t)).toMatchObject({
        state: "available",
        source: { owner: "kjohnson2719", repo: "mise", branch: "main" },
        builtAt: BUILT,
        running: "262ab86",
        latest: "5f92224",
        changes: [
          { sha: "5f92224", title: "Lean on Fry's sales" },
          { sha: "e9be12c", title: "Run Kokoro in the dev stack" },
        ],
        setupFiles: ["compose.yaml"],
        compareUrl:
          "https://github.com/kjohnson2719/mise/compare/262ab86...5f92224",
      })
      expect(calls[0]).toBe(
        "/repos/kjohnson2719/mise/activity?ref=refs%2Fheads%2Fmain&per_page=100"
      )
      // Kept for a while, unless asked to check now.
      await status(t)
      expect(calls).toHaveLength(2)
      await t.admin.post("/api/updates/check", {})
      expect(calls).toHaveLength(4)
    } finally {
      await t.close()
    }
  })

  test("pushes that only touch docs and tests aren't an update", async () => {
    const t = await createTestAppWithAdmin({
      updates: {
        builtAt: BUILT,
        githubFetch: fakeGithub([
          "docs/roadmap.md",
          "README.md",
          "apps/server/src/routes/sales.test.ts",
        ]),
      },
    })
    try {
      expect(await status(t)).toMatchObject({
        state: "current",
        running: "262ab86",
        changes: [],
      })
    } finally {
      await t.close()
    }
  })

  test("up to date when nothing was pushed after the build", async () => {
    const t = await createTestAppWithAdmin({
      updates: {
        builtAt: "2026-10-15T05:00:00Z",
        githubFetch: fakeGithub([]),
      },
    })
    try {
      expect(await status(t)).toMatchObject({
        state: "current",
        running: "5f92224",
        latest: "5f92224",
      })
    } finally {
      await t.close()
    }
  })

  test("says why it can't tell", async () => {
    const cases = [
      [{ builtAt: null }, /development copy/],
      [{ builtAt: BUILT, buildContext: "." }, /local folder/],
      [
        {
          builtAt: BUILT,
          buildContext: "https://github.com/kjohnson2719/mise.git#v0.1.0",
        },
        /pins it to v0\.1\.0/,
      ],
      [
        {
          builtAt: BUILT,
          githubFetch: (async () =>
            new Response("{}", { status: 503 })) as typeof fetch,
        },
        /Couldn't reach GitHub/,
      ],
    ] as const
    for (const [options, reason] of cases) {
      const found = await createUpdateService(options).status()
      expect(found.state).toBe("unknown")
      expect(found.reason).toMatch(reason)
    }
  })

  test("only the server admin can see it", async () => {
    const t = await createTestAppWithAdmin()
    try {
      const invite = await t.admin.post("/api/household/invites", {
        role: "member",
      })
      const member = apiClient(t.app)
      await member.post(`/api/join/${invite.body.invite.token}`, {
        displayName: "Jamie",
        username: "jamie",
        password: "correct horse battery",
      })
      expect((await member.get("/api/updates")).status).toBe(403)
      expect((await t.admin.get("/api/updates")).status).toBe(200)
    } finally {
      await t.close()
    }
  })
})
