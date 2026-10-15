import * as React from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Delete02Icon,
  PencilEdit02Icon,
  Search01Icon,
} from "@hugeicons/core-free-icons"
import type { Tag } from "@mise/shared"
import { toast } from "sonner"

import { ResponsiveDialog } from "@/components/responsive-dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { ApiError } from "@/lib/api"

import { useDeleteTag, useRenameTag, useTags } from "./use-recipes"

function failed(error: unknown) {
  toast.error(error instanceof ApiError ? error.message : "Couldn't save that")
}

/**
 * Every tag in the household, to rename, merge (rename one to another's
 * name) or delete. A big imported library tends to need this.
 */
export function ManageTagsDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Tags"
      description="Rename a tag to another's name to merge them."
    >
      {open && <ManageTags />}
    </ResponsiveDialog>
  )
}

function ManageTags() {
  const tags = useTags()
  const [find, setFind] = React.useState("")
  const [editing, setEditing] = React.useState<string | null>(null)
  const [deleting, setDeleting] = React.useState<string | null>(null)

  const shown = (tags.data ?? []).filter((tag) =>
    tag.name.toLowerCase().includes(find.trim().toLowerCase())
  )

  return (
    <div className="grid gap-3">
      <InputGroup>
        <InputGroupAddon>
          <HugeiconsIcon icon={Search01Icon} strokeWidth={2} />
        </InputGroupAddon>
        <InputGroupInput
          placeholder="Find a tag"
          aria-label="Find a tag"
          value={find}
          onChange={(event) => setFind(event.target.value)}
        />
      </InputGroup>
      {tags.isPending ? (
        <div className="grid gap-2">
          <Skeleton className="h-10" />
          <Skeleton className="h-10" />
        </div>
      ) : !shown.length ? (
        <p className="py-4 text-center text-sm text-muted-foreground">
          {tags.data?.length ? "No tags match." : "No tags yet."}
        </p>
      ) : (
        <ul className="grid max-h-[50vh] divide-y overflow-y-auto rounded-xl border">
          {shown.map((tag) =>
            editing === tag.name ? (
              <RenameRow
                key={tag.name}
                tag={tag}
                all={tags.data ?? []}
                onDone={() => setEditing(null)}
              />
            ) : deleting === tag.name ? (
              <DeleteRow
                key={tag.name}
                tag={tag}
                onDone={() => setDeleting(null)}
              />
            ) : (
              <li
                key={tag.name}
                className="flex items-center gap-2 py-1 pr-1 pl-3"
              >
                <span className="min-w-0 flex-1 truncate">{tag.name}</span>
                <span className="text-sm text-muted-foreground tabular-nums">
                  {tag.count}
                </span>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Rename ${tag.name}`}
                  onClick={() => {
                    setDeleting(null)
                    setEditing(tag.name)
                  }}
                >
                  <HugeiconsIcon icon={PencilEdit02Icon} strokeWidth={2} />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Delete ${tag.name}`}
                  onClick={() => {
                    setEditing(null)
                    setDeleting(tag.name)
                  }}
                >
                  <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} />
                </Button>
              </li>
            )
          )}
        </ul>
      )}
    </div>
  )
}

function RenameRow({
  tag,
  all,
  onDone,
}: {
  tag: Tag
  all: Tag[]
  onDone: () => void
}) {
  const rename = useRenameTag()
  const [name, setName] = React.useState(tag.name)
  const into = all.find(
    (other) =>
      other.name !== tag.name &&
      other.name.toLowerCase() === name.trim().toLowerCase()
  )
  const unchanged = name.trim() === tag.name

  return (
    <li className="grid gap-2 p-2">
      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          if (!name.trim() || unchanged) return onDone()
          rename.mutate(
            { from: tag.name, to: name.trim() },
            {
              onSuccess: () => {
                toast.success(
                  into
                    ? `Merged ${tag.name} into ${into.name}`
                    : `Renamed to ${name.trim()}`
                )
                onDone()
              },
              onError: failed,
            }
          )
        }}
      >
        <Input
          autoFocus
          aria-label={`New name for ${tag.name}`}
          value={name}
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => event.key === "Escape" && onDone()}
        />
        <Button type="submit" disabled={rename.isPending || !name.trim()}>
          {rename.isPending && <Spinner data-icon="inline-start" />}
          {into ? "Merge" : "Save"}
        </Button>
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </form>
      {into && (
        <p className="px-1 text-xs text-muted-foreground">
          {tag.count} {tag.count === 1 ? "recipe" : "recipes"} will move to{" "}
          <span className="font-medium text-foreground">{into.name}</span>, and{" "}
          {tag.name} goes away.
        </p>
      )}
    </li>
  )
}

function DeleteRow({ tag, onDone }: { tag: Tag; onDone: () => void }) {
  const remove = useDeleteTag()
  return (
    <li className="flex flex-wrap items-center gap-2 bg-destructive/5 p-2">
      <span className="min-w-0 flex-1 text-sm">
        Take <span className="font-medium">{tag.name}</span> off {tag.count}{" "}
        {tag.count === 1 ? "recipe" : "recipes"}?
      </span>
      <Button
        variant="destructive"
        size="sm"
        disabled={remove.isPending}
        onClick={() =>
          remove.mutate(tag.name, {
            onSuccess: () => {
              toast.success(`Deleted ${tag.name}`)
              onDone()
            },
            onError: failed,
          })
        }
      >
        {remove.isPending && <Spinner data-icon="inline-start" />}
        Delete
      </Button>
      <Button variant="ghost" size="sm" onClick={onDone}>
        Cancel
      </Button>
    </li>
  )
}
