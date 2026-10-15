import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

const env = process.env

/** When the Docker image was built: the Dockerfile stamps it in BUILT_AT. */
function readBuiltAt() {
  try {
    const stamp = readFileSync(
      new URL("../../../BUILT_AT", import.meta.url),
      "utf8"
    ).trim()
    return Number.isNaN(Date.parse(stamp)) ? null : stamp
  } catch {
    return null
  }
}

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
  /** When this image was built, for "an update is available". */
  builtAt: env.MISE_BUILT_AT || readBuiltAt(),
  /** Where the image is built from; the compose file passes it along. */
  buildContext:
    env.MISE_BUILD_CONTEXT || "https://github.com/kjohnson2719/mise.git#main",
}
