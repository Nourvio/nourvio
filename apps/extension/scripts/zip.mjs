// Packs the built extension (dist/) into release/mise-extension.zip, which
// Mise offers for download in Settings.
import {
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs"
import { join, relative } from "node:path"
import { fileURLToPath } from "node:url"

import { zipSync } from "fflate"

const root = fileURLToPath(new URL("..", import.meta.url))
const dist = join(root, "dist")

function files(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    return statSync(path).isDirectory() ? files(path) : [path]
  })
}

const entries = Object.fromEntries(
  files(dist).map((path) => [
    relative(dist, path).replaceAll("\\", "/"),
    readFileSync(path),
  ])
)
mkdirSync(join(root, "release"), { recursive: true })
writeFileSync(
  join(root, "release", "mise-extension.zip"),
  zipSync(entries, { level: 9 })
)
console.log(
  `Packed ${Object.keys(entries).length} files into release/mise-extension.zip`
)
