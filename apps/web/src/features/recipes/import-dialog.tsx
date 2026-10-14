import * as React from "react"
import type { Recipe } from "@mise/shared"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Add01Icon,
  Camera01Icon,
  Cancel01Icon,
  Link01Icon,
  Note01Icon,
  SparklesIcon,
} from "@hugeicons/core-free-icons"
import { Link, useNavigate } from "react-router"
import { toast } from "sonner"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { useCurrentUser } from "@/features/auth/current-user"
import { useAiStatus } from "@/features/settings/use-ai"
import { ApiError } from "@/lib/api"

import {
  findLink,
  useImportDialog,
  useImportPhotos,
  useImportText,
  useImportUrl,
  type ImportTab,
} from "./use-import"

const MAX_PHOTOS = 4

/** Same hosts the server sends to the video importer. */
const VIDEO_LINK =
  /^https?:\/\/([^/]+\.)?(tiktok\.com|youtube\.com|youtu\.be|instagram\.com|instagr\.am|facebook\.com|fb\.watch)(\/|$)/i

function errorText(error: unknown, field?: string) {
  if (!error) return undefined
  if (error instanceof ApiError) {
    return (field && error.fields[field]) || error.message
  }
  return "Couldn't reach Mise. Check your connection."
}

/** After an import: say so, close the dialog and open the recipe. */
function useOpenImported(onDone: () => void) {
  const navigate = useNavigate()
  return (recipe: Recipe) => {
    toast.success(`Added ${recipe.name}`)
    onDone()
    navigate(`/recipes/${recipe.slug}`)
  }
}

/** Add a recipe from a link, pasted text or a photo. Opened with `?import=…`. */
export function ImportDialog() {
  const { tab, sharedLink, open, close } = useImportDialog()

  return (
    <Dialog open={tab !== null} onOpenChange={(next) => !next && close()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add a recipe</DialogTitle>
          <DialogDescription>
            Bring in a recipe from anywhere. You can tidy it up after.
          </DialogDescription>
        </DialogHeader>
        <Tabs
          value={tab ?? "link"}
          onValueChange={(value) => open(value as ImportTab)}
          className="min-w-0 gap-4"
        >
          <TabsList className="w-full">
            <TabsTrigger value="link">
              <HugeiconsIcon icon={Link01Icon} strokeWidth={2} />
              Link
            </TabsTrigger>
            <TabsTrigger value="text">
              <HugeiconsIcon icon={Note01Icon} strokeWidth={2} />
              Text
            </TabsTrigger>
            <TabsTrigger value="photo">
              <HugeiconsIcon icon={Camera01Icon} strokeWidth={2} />
              Photo
            </TabsTrigger>
          </TabsList>
          <TabsContent value="link">
            {/* Remount when a different link is shared in. */}
            <LinkImport
              key={sharedLink}
              initialUrl={sharedLink}
              onDone={close}
            />
          </TabsContent>
          <TabsContent value="text">
            <NeedsAi onDone={close}>
              <TextImport onDone={close} />
            </NeedsAi>
          </TabsContent>
          <TabsContent value="photo">
            <NeedsAi onDone={close}>
              <PhotoImport onDone={close} />
            </NeedsAi>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}

function LinkImport({
  initialUrl,
  onDone,
}: {
  initialUrl: string
  onDone: () => void
}) {
  const navigate = useNavigate()
  const opened = useOpenImported(onDone)
  const importUrl = useImportUrl()
  const [url, setUrl] = React.useState(initialUrl)
  const [duplicate, setDuplicate] = React.useState<Recipe | null>(null)
  const canPaste =
    typeof navigator !== "undefined" && Boolean(navigator.clipboard?.readText)
  const error = errorText(importUrl.error, "url")
  const isVideo = VIDEO_LINK.test(url.trim())

  function submit(force = false) {
    setDuplicate(null)
    importUrl.mutate(
      { url: url.trim(), force },
      {
        onSuccess: ({ recipe, duplicate }) => {
          if (duplicate) setDuplicate(recipe)
          else opened(recipe)
        },
      }
    )
  }

  async function paste() {
    try {
      const text = await navigator.clipboard.readText()
      setUrl(findLink(text) || text.trim())
    } catch {
      // The browser said no; typing still works.
    }
  }

  return (
    <form
      className="grid gap-4"
      onSubmit={(event) => {
        event.preventDefault()
        submit()
      }}
    >
      <Field data-invalid={error ? true : undefined}>
        <FieldLabel htmlFor="import-url">Recipe link</FieldLabel>
        <InputGroup>
          <InputGroupInput
            id="import-url"
            type="url"
            inputMode="url"
            autoComplete="off"
            placeholder="https://"
            required
            autoFocus
            value={url}
            aria-invalid={error ? true : undefined}
            onChange={(event) => {
              setUrl(event.target.value)
              setDuplicate(null)
            }}
          />
          {canPaste && !url && (
            <InputGroupAddon align="inline-end">
              <InputGroupButton onClick={paste}>Paste</InputGroupButton>
            </InputGroupAddon>
          )}
        </InputGroup>
        {error ? (
          <FieldError>{error}</FieldError>
        ) : (
          <FieldDescription>
            {importUrl.isPending && isVideo
              ? "Watching the video. This can take a minute."
              : "Works with most recipe sites, and with TikTok, YouTube and Instagram videos."}
          </FieldDescription>
        )}
      </Field>

      {duplicate && (
        <Alert>
          <AlertTitle>You already have this one</AlertTitle>
          <AlertDescription>
            <p>
              <Link
                to={`/recipes/${duplicate.slug}`}
                onClick={onDone}
                className="font-medium underline underline-offset-4"
              >
                {duplicate.name}
              </Link>{" "}
              came from this link.
            </p>
          </AlertDescription>
        </Alert>
      )}

      <DialogFooter>
        {duplicate ? (
          <>
            <Button
              type="button"
              variant="outline"
              disabled={importUrl.isPending}
              onClick={() => submit(true)}
            >
              {importUrl.isPending && <Spinner data-icon="inline-start" />}
              Import a copy
            </Button>
            <Button
              type="button"
              onClick={() => {
                onDone()
                navigate(`/recipes/${duplicate.slug}`)
              }}
            >
              Open it
            </Button>
          </>
        ) : (
          <Button type="submit" disabled={importUrl.isPending || !url.trim()}>
            {importUrl.isPending && <Spinner data-icon="inline-start" />}
            {importUrl.isPending
              ? isVideo
                ? "Watching…"
                : "Reading the page…"
              : "Import"}
          </Button>
        )}
      </DialogFooter>
    </form>
  )
}

/** Text and photo import need an AI key. Explains how to get one set up. */
function NeedsAi({
  children,
  onDone,
}: {
  children: React.ReactNode
  onDone: () => void
}) {
  const status = useAiStatus()
  const me = useCurrentUser()
  const runsServer = me.isServerAdmin

  if (status.isPending) return <Skeleton className="h-48" />
  if (status.data?.available) return children
  return (
    <Empty className="border border-dashed py-8">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <HugeiconsIcon icon={SparklesIcon} strokeWidth={2} />
        </EmptyMedia>
        <EmptyTitle>This needs AI</EmptyTitle>
        <EmptyDescription>
          {runsServer ? "Add" : "Ask whoever runs this Mise to add"} a Claude or
          OpenAI key in Settings, and Mise can read recipes from text and
          photos.
        </EmptyDescription>
      </EmptyHeader>
      {runsServer && (
        <EmptyContent>
          <Button asChild>
            <Link to="/settings" onClick={onDone}>
              Set up AI
            </Link>
          </Button>
        </EmptyContent>
      )}
    </Empty>
  )
}

function TextImport({ onDone }: { onDone: () => void }) {
  const opened = useOpenImported(onDone)
  const importText = useImportText()
  const [text, setText] = React.useState("")
  const error = errorText(importText.error, "text")

  return (
    <form
      className="grid gap-4"
      onSubmit={(event) => {
        event.preventDefault()
        importText.mutate(text, { onSuccess: ({ recipe }) => opened(recipe) })
      }}
    >
      <Field data-invalid={error ? true : undefined}>
        <FieldLabel htmlFor="import-text">Recipe</FieldLabel>
        <Textarea
          id="import-text"
          autoFocus
          rows={10}
          className="max-h-[45dvh] min-h-40"
          placeholder="Paste a recipe from a message, a note, ChatGPT or anywhere else"
          value={text}
          aria-invalid={error ? true : undefined}
          onChange={(event) => setText(event.target.value)}
        />
        {error ? (
          <FieldError>{error}</FieldError>
        ) : (
          <FieldDescription>
            {importText.isPending
              ? "This can take up to half a minute."
              : "Mise sorts it into ingredients and steps."}
          </FieldDescription>
        )}
      </Field>
      <DialogFooter>
        <Button
          type="submit"
          disabled={importText.isPending || text.trim().length < 20}
        >
          {importText.isPending && <Spinner data-icon="inline-start" />}
          {importText.isPending ? "Reading the recipe…" : "Import"}
        </Button>
      </DialogFooter>
    </form>
  )
}

type Photo = { file: File; url: string }

function PhotoImport({ onDone }: { onDone: () => void }) {
  const opened = useOpenImported(onDone)
  const importPhotos = useImportPhotos()
  const inputRef = React.useRef<HTMLInputElement>(null)
  const [photos, setPhotos] = React.useState<Photo[]>([])
  const error = errorText(importPhotos.error)

  // Free the previews' memory when the tab closes.
  const latest = React.useRef(photos)
  React.useEffect(() => {
    latest.current = photos
  }, [photos])
  React.useEffect(
    () => () => latest.current.forEach((p) => URL.revokeObjectURL(p.url)),
    []
  )

  function add(files: FileList | null) {
    const added = [...(files ?? [])]
      .filter((file) => file.type.startsWith("image/"))
      .slice(0, MAX_PHOTOS - photos.length)
      .map((file) => ({ file, url: URL.createObjectURL(file) }))
    setPhotos((current) => [...current, ...added])
  }

  function remove(photo: Photo) {
    URL.revokeObjectURL(photo.url)
    setPhotos((current) => current.filter((p) => p !== photo))
  }

  return (
    <form
      className="grid gap-4"
      onSubmit={(event) => {
        event.preventDefault()
        importPhotos.mutate(
          photos.map((p) => p.file),
          { onSuccess: ({ recipe }) => opened(recipe) }
        )
      }}
    >
      <Field data-invalid={error ? true : undefined}>
        <FieldLabel>Photos</FieldLabel>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          className="sr-only"
          tabIndex={-1}
          aria-hidden
          onChange={(event) => {
            add(event.target.files)
            event.target.value = ""
          }}
        />
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {photos.map((photo, index) => (
            <div
              key={photo.url}
              className="relative aspect-[3/4] overflow-hidden rounded-xl border bg-muted"
            >
              <img
                src={photo.url}
                alt={`Page ${index + 1}`}
                className="size-full object-cover"
              />
              <Button
                type="button"
                size="icon-xs"
                variant="secondary"
                className="absolute top-1.5 right-1.5"
                aria-label={`Remove page ${index + 1}`}
                disabled={importPhotos.isPending}
                onClick={() => remove(photo)}
              >
                <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} />
              </Button>
            </div>
          ))}
          {photos.length < MAX_PHOTOS && (
            <button
              type="button"
              className="flex aspect-[3/4] flex-col items-center justify-center gap-2 rounded-xl border border-dashed p-3 text-center text-sm text-muted-foreground transition-colors hover:bg-muted focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none disabled:opacity-50"
              disabled={importPhotos.isPending}
              onClick={() => inputRef.current?.click()}
            >
              <HugeiconsIcon
                icon={photos.length ? Add01Icon : Camera01Icon}
                strokeWidth={2}
                className="size-6"
              />
              {photos.length ? "Add a page" : "Take or choose a photo"}
            </button>
          )}
        </div>
        {error ? (
          <FieldError>{error}</FieldError>
        ) : (
          <FieldDescription>
            {importPhotos.isPending
              ? "This can take up to half a minute."
              : `A cookbook page, a recipe card or a screenshot. Up to ${MAX_PHOTOS} photos for a recipe over several pages.`}
          </FieldDescription>
        )}
      </Field>
      <DialogFooter>
        <Button
          type="submit"
          disabled={importPhotos.isPending || photos.length === 0}
        >
          {importPhotos.isPending && <Spinner data-icon="inline-start" />}
          {importPhotos.isPending ? "Reading the recipe…" : "Import"}
        </Button>
      </DialogFooter>
    </form>
  )
}
