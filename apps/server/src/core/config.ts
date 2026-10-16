import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"
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
  /** Signs sessions and encrypts saved keys. Unset: made once and kept in the data folder. */
  MERRAN_SECRET: z.string().min(32, "Use at least 32 characters").optional(),
  /** The address people use to reach Merran, like https://merran.example.com. */
  MERRAN_PUBLIC_URL: z.url({ protocol: /^https?$/ }).optional(),
  /**
   * Proxies in front of Merran whose X-Forwarded-For is believed: addresses
   * or ranges, separated by commas ("172.16.0.0/12, 127.0.0.1").
   */
  MERRAN_TRUSTED_PROXIES: z
    .string()
    .transform((value) =>
      value
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean)
    )
    .pipe(
      z.array(
        z.union([z.ipv4(), z.ipv6(), z.cidrv4(), z.cidrv6()], {
          error: "Use IP addresses or ranges, like 172.16.0.0/12",
        })
      )
    )
    .default([]),
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
  /** From MERRAN_SECRET; when unset, the server keeps one in the data folder. */
  secret: string | undefined
  publicUrl: string | undefined
  trustedProxies: string[]
  /** The built web app to serve, or null to serve only the API. */
  webDir: string | null
}

/** Where `pnpm --filter @merran/web build` puts the web app. */
const WEB_DIR = fileURLToPath(new URL("../../../web/dist", import.meta.url))

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
    secret: settings.MERRAN_SECRET,
    publicUrl: settings.MERRAN_PUBLIC_URL?.replace(/\/$/, ""),
    trustedProxies: settings.MERRAN_TRUSTED_PROXIES,
    webDir: WEB_DIR,
  }
}
