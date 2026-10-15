import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { z } from "zod"

const LOG_LEVELS = [
  "fatal",
  "error",
  "warn",
  "info",
  "debug",
  "trace",
  "silent",
] as const

/** Every setting read from the environment. Only what's here is read. */
const envSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
  MERRAN_LOG_LEVEL: z.enum(LOG_LEVELS).default("info"),
  /** `auto` is readable lines in a terminal and JSON everywhere else. */
  MERRAN_LOG_FORMAT: z.enum(["auto", "pretty", "json"]).default("auto"),
  /** Where Merran keeps its files, and its SQLite database when there's no Postgres. */
  MERRAN_DATA_DIR: z.string().default("data"),
  /** A Postgres address. Leave it unset to use SQLite. */
  DATABASE_URL: z
    .string()
    .regex(
      /^postgres(ql)?:\/\//,
      "Use a postgres:// address, or leave it unset to use SQLite"
    )
    .optional(),
})

export type LogLevel = (typeof LOG_LEVELS)[number]

export type DatabaseConfig =
  { kind: "sqlite"; file: string } | { kind: "postgres"; url: string }

export type Config = {
  version: string
  port: number
  logLevel: LogLevel
  logFormat: "pretty" | "json"
  dataDir: string
  database: DatabaseConfig
}

const packageJson = JSON.parse(
  readFileSync(new URL("../../package.json", import.meta.url), "utf8")
) as { version: string }

/**
 * Reads the settings, or throws one error listing everything that's wrong.
 * An empty variable (`PORT=`) counts as not set.
 */
export function loadConfig(
  env: Record<string, string | undefined> = process.env
): Config {
  const values = Object.fromEntries(
    Object.entries(env).filter(([, value]) => value !== "")
  )
  const result = envSchema.safeParse(values)
  if (!result.success) {
    const problems = result.error.issues
      .map((issue) => `  ${issue.path.map(String).join(".")}: ${issue.message}`)
      .join("\n")
    throw new Error(
      `Merran can't start, because of these settings:\n${problems}`
    )
  }

  const settings = result.data
  return {
    version: packageJson.version,
    port: settings.PORT,
    logLevel: settings.MERRAN_LOG_LEVEL,
    logFormat:
      settings.MERRAN_LOG_FORMAT === "auto"
        ? process.stdout.isTTY
          ? "pretty"
          : "json"
        : settings.MERRAN_LOG_FORMAT,
    dataDir: resolve(settings.MERRAN_DATA_DIR),
    database: settings.DATABASE_URL
      ? { kind: "postgres", url: settings.DATABASE_URL }
      : {
          kind: "sqlite",
          file: resolve(settings.MERRAN_DATA_DIR, "merran.db"),
        },
  }
}
