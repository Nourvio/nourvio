import type { Readable } from "node:stream"
import yauzl from "yauzl"

/** The most any one file in an upload is read into memory. */
const MAX_FILE_BYTES = 500_000_000

async function toBuffer(stream: Readable) {
  const chunks: Buffer[] = []
  for await (const chunk of stream) chunks.push(Buffer.from(chunk as Buffer))
  return Buffer.concat(chunks)
}

/**
 * A zip on disk: the names of what's in it, and each file read only when
 * it's wanted. Close it when done.
 */
export async function openZip(path: string) {
  const zip = await yauzl.openPromise(path, {
    autoClose: false,
    lazyEntries: true,
  })
  const entries = new Map<string, yauzl.Entry>()
  try {
    for await (const entry of zip.eachEntry()) {
      // Folders are only in the names of what's in them.
      if (!entry.fileName.endsWith("/")) entries.set(entry.fileName, entry)
    }
  } catch (err) {
    zip.close()
    throw err
  }

  let open = true
  return {
    /** Every file's path in the zip, as "photos/1.webp". */
    names: () => [...entries.keys()],
    /** A file in the zip, or null if it's not there. */
    async read(name: string): Promise<Buffer | null> {
      const entry = entries.get(name)
      if (!entry) return null
      if (entry.uncompressedSize > MAX_FILE_BYTES) {
        throw new Error(`${name} is too big to read`)
      }
      return toBuffer(await zip.openReadStreamPromise(entry))
    },
    close() {
      if (open) zip.close()
      open = false
    },
  }
}

export type OpenZip = Awaited<ReturnType<typeof openZip>>
