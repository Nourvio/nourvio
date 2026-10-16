import { rm, stat } from "node:fs/promises"
import { AppError } from "../../core/errors.ts"
import { openZip, type OpenZip } from "../transfer/zip.ts"
import { readMealieBackup } from "./mealie/backup.ts"
import { readMealieExport } from "./mealie/export.ts"
import type { AppSource, ImportApp } from "./types.ts"

// Files from other apps: which app a file is from, and what's in it, told
// from what's inside rather than its name.

const notRecognized = () =>
  new AppError(
    "invalid",
    "not_an_import",
    "Merran can't read that file. Use a Mealie backup, or recipes exported from Mealie."
  )

async function open(path: string) {
  let zip: OpenZip
  try {
    zip = await openZip(path)
  } catch {
    throw notRecognized()
  }
  try {
    const backup = await readMealieBackup(zip)
    if (backup) return { zip, backup, recipes: null }
    const recipes = await readMealieExport(zip)
    if (recipes) return { zip, backup: null, recipes }
  } catch (err) {
    zip.close()
    throw err
  }
  zip.close()
  throw notRecognized()
}

export type UploadSummary = {
  app: ImportApp
  /** A whole backup, or recipes exported from the app. */
  what: "backup" | "recipes"
  recipes: number
  /** A backup's groups, when there's more than one to choose from. */
  groups: { id: string; name: string; recipes: number }[]
  /** What each recipe is in the app, to see which are here already. */
  refs: string[]
}

/**
 * Says what an upload is, before its import starts. Deletes the upload if
 * it isn't something Merran can import.
 */
export async function inspectUpload(path: string): Promise<UploadSummary> {
  let found
  try {
    found = await open(path)
  } catch (err) {
    await rm(path, { force: true })
    throw err
  }
  try {
    if (found.backup) {
      const groups = found.backup.groups.filter((group) => group.recipes > 0)
      const refs = found.backup.refs(null)
      return {
        app: "mealie",
        what: "backup",
        recipes: refs.length,
        groups: groups.length > 1 ? groups : [],
        refs,
      }
    }
    const refs = found.recipes!.refs
    return {
      app: "mealie",
      what: "recipes",
      recipes: refs.length,
      groups: [],
      refs,
    }
  } finally {
    found.zip.close()
  }
}

/** The recipes in an upload, for its import job. */
export async function openUpload(
  path: string,
  { group }: { group: string | null }
): Promise<AppSource> {
  if (!(await stat(path).catch(() => null))) {
    throw new AppError(
      "not_found",
      "upload_gone",
      "That file isn't here any more. Choose it again."
    )
  }
  const found = await open(path)
  return found.backup ? found.backup.source(group) : found.recipes!.source()
}
