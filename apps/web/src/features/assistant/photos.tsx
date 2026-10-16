import { Cancel01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import type { FileUIPart } from "ai"
import * as React from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { api, ApiError, unwrap } from "@/lib/api/client"
import { shrinkPhoto } from "@/lib/shrink-photo"

// Photos to send the assistant: what's in the pan, how thick the sauce is.
// Each is uploaded as soon as it's picked, so sending is quick.

/** The most photos one message has. */
export const MAX_PHOTOS = 4

/** The server keeps them at about this size for the model. */
const MAX_SIDE = 1600

const PHOTO_URL = /^\/api\/assistant\/photos\/([a-f0-9]{24})$/

/** A photo's id, from a message's file part. */
export const photoIdOf = (url: string) => PHOTO_URL.exec(url)?.[1] ?? null

type Attached = {
  key: string
  /** Shown while it's on its way. */
  preview: string
  /** Once it's uploaded. */
  url: string | null
}

/** Photos picked for the next message: adding, removing, and sending them. */
export function useAttachedPhotos() {
  const { t } = useTranslation()
  const [photos, setPhotos] = React.useState<Attached[]>([])

  // Their previews go when they do.
  const shown = React.useRef(photos)
  shown.current = photos
  React.useEffect(
    () => () => {
      for (const photo of shown.current) URL.revokeObjectURL(photo.preview)
    },
    []
  )

  function drop(key: string) {
    setPhotos((now) =>
      now.filter((photo) => {
        if (photo.key === key) URL.revokeObjectURL(photo.preview)
        return photo.key !== key
      })
    )
  }

  async function upload(key: string, blob: Blob) {
    const form = new FormData()
    form.append("photo", blob, "photo.jpg")
    try {
      const kept = await unwrap(
        api.POST("/api/assistant/photos", {
          body: form as unknown as { photo: string },
        })
      )
      setPhotos((now) =>
        now.map((photo) =>
          photo.key === key ? { ...photo, url: kept.url } : photo
        )
      )
    } catch (err) {
      if (!(err instanceof ApiError)) throw err
      toast.error(err.message)
      drop(key)
    }
  }

  async function add(files: readonly File[]) {
    const images = files.filter((file) => file.type.startsWith("image/"))
    if (images.length === 0) return
    const room = MAX_PHOTOS - shown.current.length
    if (images.length > room) {
      toast.error(t("assistant.photos.tooMany", { count: MAX_PHOTOS }))
    }
    for (const file of images.slice(0, Math.max(room, 0))) {
      const blob = await shrinkPhoto(file, MAX_SIDE)
      const key = crypto.randomUUID()
      setPhotos((now) => [
        ...now,
        { key, preview: URL.createObjectURL(blob), url: null },
      ])
      void upload(key, blob)
    }
  }

  /** The photos as a message's parts, and cleared for the next one. */
  function take(): FileUIPart[] {
    const parts = photos.flatMap((photo) =>
      photo.url
        ? [{ type: "file" as const, mediaType: "image/jpeg", url: photo.url }]
        : []
    )
    for (const photo of photos) URL.revokeObjectURL(photo.preview)
    setPhotos([])
    return parts
  }

  return {
    photos,
    add,
    remove: drop,
    take,
    /** Still uploading one. */
    uploading: photos.some((photo) => photo.url === null),
    full: photos.length >= MAX_PHOTOS,
  }
}

/** Photos picked for the next message, each with a way to take it out. */
export function AttachedPhotos({
  photos,
  onRemove,
}: {
  photos: readonly Attached[]
  onRemove: (key: string) => void
}) {
  const { t } = useTranslation()
  if (photos.length === 0) return null
  return (
    <ul className="flex flex-wrap gap-2">
      {photos.map((photo) => (
        <li key={photo.key} className="relative">
          <img
            src={photo.preview}
            alt={t("assistant.photos.attached")}
            className="size-16 rounded-xl border object-cover"
          />
          {photo.url === null && (
            <span className="absolute inset-0 grid place-items-center rounded-xl bg-background/60">
              <Spinner />
            </span>
          )}
          <Button
            type="button"
            variant="secondary"
            size="icon-xs"
            className="absolute -top-1.5 -right-1.5 rounded-full border shadow-sm"
            aria-label={t("assistant.photos.remove")}
            onClick={() => onRemove(photo.key)}
          >
            <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} />
          </Button>
        </li>
      ))}
    </ul>
  )
}

/** Photos someone sent, in their message. */
export function SentPhotos({ urls }: { urls: readonly string[] }) {
  const { t } = useTranslation()
  if (urls.length === 0) return null
  return (
    <div className="ml-auto flex max-w-[85%] flex-wrap justify-end gap-2">
      {urls.map((url) => (
        <a key={url} href={url} target="_blank" rel="noreferrer">
          <img
            src={url}
            alt={t("assistant.photos.sent")}
            loading="lazy"
            className="max-h-48 max-w-48 rounded-2xl border object-cover"
          />
        </a>
      ))}
    </div>
  )
}
