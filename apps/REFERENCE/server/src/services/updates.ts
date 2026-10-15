import {
  changesTheApp,
  parseBuildContext,
  SETUP_FILES,
  type UpdateStatus,
} from "@mise/shared"

import { config } from "../config.ts"

/** A check is kept this long; GitHub allows 60 calls an hour without a key. */
const CHECK_EVERY_MS = 6 * 60 * 60_000
/** After GitHub couldn't be reached, try again sooner. */
const RETRY_MS = 30 * 60_000
/** The changes listed, newest first. */
const MAX_CHANGES = 30

/* eslint-disable @typescript-eslint/no-explicit-any -- GitHub's JSON, read defensively */

/**
 * Whether GitHub has a newer Nourvio than this server runs. The image stamps
 * when it was built (BUILT_AT); anything pushed to its branch after that,
 * touching the app rather than only docs, is an update. GitHub's history of
 * pushes says which commit was built and what's changed since.
 */
export function createUpdateService(
  options: {
    githubFetch?: typeof fetch
    builtAt?: string | null
    buildContext?: string
  } = {}
) {
  const github = options.githubFetch ?? fetch
  const builtAt =
    options.builtAt !== undefined ? options.builtAt : config.builtAt
  const source = parseBuildContext(options.buildContext ?? config.buildContext)
  let cached: { until: number; status: UpdateStatus } | null = null

  const unknown = (reason: string): UpdateStatus => ({
    state: "unknown",
    reason,
    source: source?.kind === "branch" ? source : null,
    builtAt,
    running: null,
    latest: null,
    changes: [],
    setupFiles: [],
    compareUrl: null,
    checkedAt: null,
  })

  async function get(path: string) {
    const res = await github(`https://api.github.com${path}`, {
      headers: {
        accept: "application/vnd.github+json",
        "user-agent": `Nourvio/${config.version}`,
        "x-github-api-version": "2022-11-28",
      },
      signal: AbortSignal.timeout(10_000),
    })
    if (!res.ok) throw new Error(`GitHub answered ${res.status}`)
    return (await res.json()) as any
  }

  async function check(): Promise<UpdateStatus> {
    if (!builtAt) {
      return unknown(
        "This copy wasn't built by Docker (a development copy, say), so there's no build to compare."
      )
    }
    if (!source) {
      return unknown(
        "It's built from a local folder rather than GitHub, so there's nothing to follow."
      )
    }
    if (source.kind === "pinned") {
      return unknown(
        `MISE_BUILD_CONTEXT pins it to ${source.ref}. Point it at a branch, like #main, to follow updates.`
      )
    }
    const { owner, repo, branch } = source
    const repoPath = `/repos/${owner}/${repo}`
    const built = Date.parse(builtAt)
    const pushes = (
      (await get(
        `${repoPath}/activity?ref=${encodeURIComponent(`refs/heads/${branch}`)}&per_page=100`
      )) as any[]
    )
      .filter(
        (event) =>
          (event.activity_type === "push" ||
            event.activity_type === "force_push") &&
          typeof event.after === "string"
      )
      .map((event) => ({
        at: Date.parse(event.timestamp),
        before: String(event.before),
        after: String(event.after),
      }))
      .sort((a, b) => a.at - b.at)
    const since = pushes.filter((push) => push.at > built)
    const before = pushes.filter((push) => push.at <= built).at(-1)
    const status: UpdateStatus = {
      state: "current",
      reason: null,
      source: { owner, repo, branch },
      builtAt,
      running: since[0]?.before ?? before?.after ?? null,
      latest: since.at(-1)?.after ?? before?.after ?? null,
      changes: [],
      setupFiles: [],
      compareUrl: null,
      checkedAt: new Date().toISOString(),
    }
    if (!since.length) return status

    const base = since[0]!.before
    const head = since.at(-1)!.after
    const compare = await get(`${repoPath}/compare/${base}...${head}`)
    const files = ((compare.files ?? []) as any[]).map((file) =>
      String(file.filename)
    )
    if (!changesTheApp(files)) return status
    return {
      ...status,
      state: "available",
      changes: ((compare.commits ?? []) as any[])
        .map((commit) => ({
          sha: String(commit.sha).slice(0, 7),
          title: String(commit.commit?.message ?? "")
            .split("\n")[0]!
            .trim(),
          at: String(
            commit.commit?.committer?.date ?? commit.commit?.author?.date ?? ""
          ),
        }))
        .reverse()
        .slice(0, MAX_CHANGES),
      setupFiles: SETUP_FILES.filter((file) => files.includes(file)),
      compareUrl: `https://github.com/${owner}/${repo}/compare/${base.slice(0, 7)}...${head.slice(0, 7)}`,
    }
  }

  return {
    /** The last check, or a fresh one when it's old or asked for. */
    async status(fresh = false): Promise<UpdateStatus> {
      if (!fresh && cached && cached.until > Date.now()) return cached.status
      try {
        const status = await check()
        cached = { until: Date.now() + CHECK_EVERY_MS, status }
        return status
      } catch (error) {
        const status = unknown(
          `Couldn't reach GitHub to check (${error instanceof Error ? error.message : "no answer"}).`
        )
        cached = { until: Date.now() + RETRY_MS, status }
        return status
      }
    },
  }
}

export type UpdateService = ReturnType<typeof createUpdateService>
