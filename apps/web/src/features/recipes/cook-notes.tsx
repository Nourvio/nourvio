import * as React from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import { Delete02Icon, NoteEditIcon } from "@hugeicons/core-free-icons"
import type { Recipe } from "@mise/shared"
import { toast } from "sonner"

import { ResponsiveDialog } from "@/components/responsive-dialog"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import { ApiError } from "@/lib/api"

import { formatRelativeDate } from "./format"
import { RatingStars } from "./rating-stars"
import { useAddCookNote, useCookNotes, useDeleteCookNote } from "./use-recipes"

/**
 * "How did it go?": stars and a note after cooking. Stars rate the recipe;
 * a note, with AI set up, comes back as a suggested change to review.
 */
export function CookNoteDialog({
  recipe,
  open,
  onDone,
}: {
  recipe: Pick<Recipe, "id" | "name" | "rating">
  open: boolean
  /** Saved or skipped. */
  onDone: () => void
}) {
  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={(next) => !next && onDone()}
      title="How did it go?"
      description={`Rate ${recipe.name}, and note anything to change next time.`}
    >
      {open && <CookNoteForm recipe={recipe} onDone={onDone} />}
    </ResponsiveDialog>
  )
}

function CookNoteForm({
  recipe,
  onDone,
}: {
  recipe: Pick<Recipe, "id" | "name" | "rating">
  onDone: () => void
}) {
  const add = useAddCookNote(recipe.id)
  const [rating, setRating] = React.useState<number | null>(recipe.rating)
  const [note, setNote] = React.useState("")
  const empty = rating === null && !note.trim()

  function save() {
    add.mutate(
      { rating, note: note.trim() || null },
      {
        onSuccess: ({ suggesting }) => {
          toast.success("Saved", {
            description: suggesting
              ? "Your note will be waiting on the recipe as a suggested change."
              : undefined,
          })
          onDone()
        },
        onError: (error) =>
          toast.error(
            error instanceof ApiError ? error.message : "Couldn't save that"
          ),
      }
    )
  }

  return (
    <form
      className="grid gap-4"
      onSubmit={(event) => {
        event.preventDefault()
        if (!empty) save()
      }}
    >
      <div className="flex justify-center">
        <RatingStars value={rating} onChange={setRating} size="md" />
      </div>
      <Textarea
        value={note}
        onChange={(event) => setNote(event.target.value)}
        placeholder="Anything to change next time? Like “needed more salt” or “5 minutes less in the oven”."
        aria-label="A note for next time"
        maxLength={1000}
        rows={3}
      />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onDone}>
          Skip
        </Button>
        <Button type="submit" disabled={empty || add.isPending}>
          {add.isPending && <Spinner data-icon="inline-start" />}
          Save
        </Button>
      </div>
    </form>
  )
}

/** The recipe page's notes from past cooking, with a way to add one. */
export function CookNotes({ recipe }: { recipe: Recipe }) {
  const notes = useCookNotes(recipe.id)
  const remove = useDeleteCookNote(recipe.id)
  const [adding, setAdding] = React.useState(false)
  const list = notes.data ?? []

  return (
    <section className="grid gap-3" aria-labelledby="cook-notes-heading">
      <div className="flex items-center justify-between gap-3">
        <h2 id="cook-notes-heading" className="text-xl font-semibold">
          Cooking notes
        </h2>
        <Button variant="ghost" size="sm" onClick={() => setAdding(true)}>
          <HugeiconsIcon
            icon={NoteEditIcon}
            strokeWidth={2}
            data-icon="inline-start"
          />
          Add a note
        </Button>
      </div>
      {list.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          How it went each time you made it. Finish cooking in the cook view to
          be asked.
        </p>
      ) : (
        <ul className="grid gap-2">
          {list.map((note) => (
            <li
              key={note.id}
              className="group flex items-start gap-3 rounded-2xl border bg-card p-3 text-sm"
            >
              <div className="grid min-w-0 flex-1 gap-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-muted-foreground">
                  {note.rating && <RatingStars value={note.rating} />}
                  <span>
                    {formatRelativeDate(note.createdAt)}
                    {note.by ? ` · ${note.by}` : ""}
                  </span>
                </div>
                {note.note && <p className="text-foreground">{note.note}</p>}
              </div>
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label="Delete this note"
                className="opacity-60 group-hover:opacity-100"
                disabled={remove.isPending}
                onClick={() => remove.mutate(note.id)}
              >
                <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} />
              </Button>
            </li>
          ))}
        </ul>
      )}
      <CookNoteDialog
        recipe={recipe}
        open={adding}
        onDone={() => setAdding(false)}
      />
    </section>
  )
}

/** The latest note with words in it, for the cook view: "Last time: needed more salt". */
export function LastCookNote({ recipeId }: { recipeId: string }) {
  const notes = useCookNotes(recipeId)
  const last = notes.data?.find((note) => note.note)
  if (!last) return null
  return (
    <p className="rounded-2xl border border-amber-500/40 bg-amber-500/5 px-4 py-3 text-base">
      <span className="font-semibold">
        Last time ({formatRelativeDate(last.createdAt)}):
      </span>{" "}
      {last.note}
    </p>
  )
}
