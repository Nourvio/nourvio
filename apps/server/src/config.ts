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
  /** The packaged browser extension, offered for download in Settings. */
  extensionZip:
    env.EXTENSION_ZIP ??
    fileURLToPath(
      new URL("../../extension/release/mise-extension.zip", import.meta.url)
    ),
  version: env.MISE_VERSION ?? "dev",
}
