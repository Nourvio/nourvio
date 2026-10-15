/** A GitHub branch the server's image is built from, which it can follow. */
export type UpdateSource = { owner: string; repo: string; branch: string }

/**
 * Where the image comes from, read from MISE_BUILD_CONTEXT:
 * "https://github.com/kjohnson2719/mise.git#main" follows main. A tag or a
 * commit ("#v0.1.0", "#5f92224") is pinned, and a local folder (".") can't
 * be followed.
 */
export function parseBuildContext(
  context: string | undefined
):
  ({ kind: "branch" } & UpdateSource) | { kind: "pinned"; ref: string } | null {
  const match = context
    ?.trim()
    .match(
      /^https:\/\/github\.com\/([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?(?:#([^:]*))?(?::.*)?$/
    )
  if (!match) return null
  const [, owner, repo, ref] = match
  const branch = ref?.trim() || "main"
  if (/^[0-9a-f]{7,40}$/.test(branch) || /^(v\d|refs\/tags\/)/.test(branch)) {
    return { kind: "pinned", ref: branch }
  }
  return { kind: "branch", owner: owner!, repo: repo!, branch }
}

// What .dockerignore leaves out of the image, and the README: a push that
// only touches these changes nothing on the server.
const OUTSIDE_THE_APP = [
  /^docs\//,
  /^\.github\//,
  /^\.claude\//,
  /^\.vscode\//,
  /^[^/]+\.md$/,
  /\.test\.ts$/,
  /^apps\/server\/src\/test\//,
  /^apps\/extension\/release\//,
]

/** Whether any of these changed files is part of the app. */
export function changesTheApp(files: string[]) {
  return files.some((file) => !OUTSIDE_THE_APP.some((rule) => rule.test(file)))
}

/** The files a stack keeps its own copy of: a rebuild doesn't pick them up. */
export const SETUP_FILES = ["compose.yaml", ".env.example"]

/** A commit since this server was built: "Lean on Fry's sales". */
export type UpdateChange = { sha: string; title: string; at: string }

/** Whether a newer Mise is on GitHub than the one running (server admin). */
export type UpdateStatus = {
  state: "current" | "available" | "unknown"
  /** Why it can't tell, when it can't. */
  reason: string | null
  source: UpdateSource | null
  /** When this server's image was built. */
  builtAt: string | null
  /** The commit it was built from, going by GitHub's history. */
  running: string | null
  /** The newest commit on the branch. */
  latest: string | null
  /** Newest first. */
  changes: UpdateChange[]
  /** Setup files the update changes, to compare with the stack's own copy. */
  setupFiles: string[]
  /** Every change on GitHub. */
  compareUrl: string | null
  checkedAt: string | null
}
