import * as React from "react"
import type { Recipe } from "@mise/shared"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Camera01Icon,
  Link01Icon,
  Note01Icon,
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
import { Spinner } from "@/components/ui/spinner"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ApiError } from "@/lib/api"

import {
  findLink,
  useImportDialog,
  useImportUrl,
  type ImportTab,
} from "./use-import"

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
          className="gap-4"
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
            <NotYet
              icon={Note01Icon}
              title="Paste a recipe"
              description="Soon: paste a recipe from a message, a note or anywhere else, and Mise will sort it into ingredients and steps."
            />
          </TabsContent>
          <TabsContent value="photo">
            <NotYet
              icon={Camera01Icon}
              title="Snap a cookbook page"
              description="Soon: take a photo of a cookbook page or a recipe card and Mise will read it for you."
            />
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
  const importUrl = useImportUrl()
  const [url, setUrl] = React.useState(initialUrl)
  const [duplicate, setDuplicate] = React.useState<Recipe | null>(null)
  const canPaste =
    typeof navigator !== "undefined" && Boolean(navigator.clipboard?.readText)

  function submit(force = false) {
    setDuplicate(null)
    importUrl.mutate(
      { url: url.trim(), force },
      {
        onSuccess: ({ recipe, duplicate }) => {
          if (duplicate) {
            setDuplicate(recipe)
            return
          }
          toast.success(`Added ${recipe.name}`)
          onDone()
          navigate(`/recipes/${recipe.slug}`)
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

  const error =
    importUrl.error instanceof ApiError
      ? (importUrl.error.fields.url ?? importUrl.error.message)
      : importUrl.error
        ? "Couldn't reach Mise. Check your connection."
        : undefined

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
            Works with most recipe sites. TikTok, YouTube and Instagram links
            are coming soon.
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
            {importUrl.isPending ? "Reading the page…" : "Import"}
          </Button>
        )}
      </DialogFooter>
    </form>
  )
}

function NotYet({
  icon,
  title,
  description,
}: {
  icon: typeof Note01Icon
  title: string
  description: string
}) {
  return (
    <Empty className="border border-dashed py-8">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <HugeiconsIcon icon={icon} strokeWidth={2} />
        </EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  )
}
