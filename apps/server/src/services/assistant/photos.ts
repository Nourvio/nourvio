import { randomBytes } from "node:crypto"
import type { UIMessage } from "ai"
import sharp from "sharp"
import { AppError } from "../../core/errors.ts"
import type { FileStore } from "../storage/files.ts"

// Photos sent to the assistant: what's in the pan, how thick the sauce
// is. Kept with the person's chats, as JPEG at the size models read them,
// and shown from their own link.

/** The most photos one message has. */
export const MAX_MESSAGE_PHOTOS = 4

/** The latest photos in a chat the model sees; older ones are said in words. */
const PHOTOS_SEEN = 8

/** Models read photos at about this many pixels on the long side. */
const LONG_SIDE = 1568

const PHOTO_ID = /^[a-f0-9]{24}$/
const PHOTO_URL = /^\/api\/assistant\/photos\/([a-f0-9]{24})$/

/** Whose photos: each person's chats are their own. */
export type PhotoOwner = { householdId: string; userId: string }

const key = (owner: PhotoOwner, photoId: string) =>
  `assistant/${owner.householdId}/${owner.userId}/${photoId}.jpg`

/** Where a photo is shown from, which is also how a message names it. */
export const photoUrl = (photoId: string) => `/api/assistant/photos/${photoId}`

/** Keeps a photo, the right way up and made smaller. */
export async function storeChatPhoto(
  files: FileStore,
  owner: PhotoOwner,
  input: Buffer
) {
  let jpeg: Buffer
  try {
    jpeg = await sharp(input, { failOn: "error" })
      .rotate()
      .resize({
        width: LONG_SIDE,
        height: LONG_SIDE,
        fit: "inside",
        withoutEnlargement: true,
      })
      .jpeg({ quality: 82 })
      .toBuffer()
  } catch {
    throw new AppError(
      "invalid",
      "not_an_image",
      "That file isn't a photo Merran can read. Use JPEG, PNG or WebP."
    )
  }
  const photoId = randomBytes(12).toString("hex")
  await files.put(key(owner, photoId), jpeg)
  return { id: photoId, url: photoUrl(photoId) }
}

/** A photo of theirs, or null if there's no such photo. */
export function readChatPhoto(
  files: FileStore,
  owner: PhotoOwner,
  photoId: string
) {
  return PHOTO_ID.test(photoId)
    ? files.read(key(owner, photoId))
    : Promise.resolve(null)
}

/** The photos in messages, by id, in order. */
export function photosIn(messages: readonly UIMessage[]) {
  return messages.flatMap((message) =>
    message.parts.flatMap((part) => {
      const id = part.type === "file" ? PHOTO_URL.exec(part.url)?.[1] : null
      return id ? [id] : []
    })
  )
}

/** Deletes photos. One that's already gone is fine. */
export async function removeChatPhotos(
  files: FileStore,
  owner: PhotoOwner,
  photoIds: readonly string[]
) {
  await Promise.all(
    photoIds
      .filter((id) => PHOTO_ID.test(id))
      .map((id) => files.remove(key(owner, id)))
  )
}

/**
 * Messages as the model gets them: the latest photos in them read in
 * from where they're kept, and older ones, or any that are gone, said in
 * words, so a long chat doesn't send every photo every time.
 */
export async function withPhotos(
  files: FileStore,
  owner: PhotoOwner,
  messages: readonly UIMessage[]
): Promise<UIMessage[]> {
  const seen = new Set(photosIn(messages).slice(-PHOTOS_SEEN))
  return Promise.all(
    messages.map(async (message) => {
      if (!message.parts.some((part) => part.type === "file")) return message
      const parts = await Promise.all(
        message.parts.map(async (part): Promise<UIMessage["parts"][number]> => {
          if (part.type !== "file") return part
          const id = PHOTO_URL.exec(part.url)?.[1]
          const photo =
            id && seen.has(id) ? await readChatPhoto(files, owner, id) : null
          return photo
            ? {
                ...part,
                url: `data:image/jpeg;base64,${photo.toString("base64")}`,
              }
            : { type: "text", text: "(A photo, no longer shown.)" }
        })
      )
      return { ...message, parts }
    })
  )
}
