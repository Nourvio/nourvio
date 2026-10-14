import { fileURLToPath } from "node:url"

const env = process.env

export const config = {
  port: Number(env.PORT ?? 3000),
  databaseUrl: env.DATABASE_URL || undefined,
  publicUrl: env.PUBLIC_URL || undefined,
  dataDir: env.DATA_DIR ?? "./data",
  /** The built web app. The Docker image puts it at the same relative path. */
  webDist:
    env.WEB_DIST ?? fileURLToPath(new URL("../../web/dist/", import.meta.url)),
  version: env.MISE_VERSION ?? "dev",
}
