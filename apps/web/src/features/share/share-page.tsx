import * as React from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import { BookOpen01Icon, Invoice01Icon } from "@hugeicons/core-free-icons"
import type { Recipe } from "@mise/shared"
import { Link, useNavigate, useSearchParams } from "react-router"
import { toast } from "sonner"

import { PageHeader } from "@/components/layout/page-header"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { ApiError, api, apiUpload } from "@/lib/api"

import { forgetShared, readShared, type Shared } from "./shared-files"

/**
 * Something shared into Mise from another app on Android: a receipt for the
 * pantry, or a recipe (photos or text). Links go straight to importing.
 */
export function SharePage() {
  const [params] = useSearchParams()
  const id = params.get("id")
  const navigate = useNavigate()
  const [shared, setShared] = React.useState<Shared | null | undefined>(
    id ? undefined : null
  )
  const [importing, setImporting] = React.useState(false)

  React.useEffect(() => {
    if (id) void readShared(id).then(setShared)
  }, [id])

  async function asRecipe() {
    if (!shared || !id) return
    setImporting(true)
    try {
      let recipe: Recipe
      if (shared.files.length) {
        const form = new FormData()
        for (const file of shared.files) form.append("photos", file)
        recipe = (await apiUpload<{ recipe: Recipe }>("/import/photo", form))
          .recipe
      } else {
        recipe = (
          await api<{ recipe: Recipe }>("/import/text", {
            body: { text: shared.text },
          })
        ).recipe
      }
      await forgetShared(id)
      navigate(`/recipes/${recipe.slug}`, { replace: true })
    } catch (error) {
      setImporting(false)
      toast.error(
        error instanceof ApiError ? error.message : "Couldn't import that"
      )
    }
  }

  const what = shared
    ? shared.files.length
      ? `${shared.files.length} ${shared.files.length === 1 ? "file" : "files"}`
      : "some text"
    : null

  return (
    <>
      <PageHeader
        title="Shared to Mise"
        description={what ? `You shared ${what}. What is it?` : undefined}
      />
      {params.get("unsupported") ? (
        <p className="max-w-xl text-muted-foreground">
          Sharing into Mise needs it opened at its https address (your
          Cloudflare tunnel, say), installed to the home screen from there.
        </p>
      ) : shared === undefined ? (
        <Skeleton className="h-32 max-w-xl rounded-3xl" />
      ) : !shared ? (
        <div className="grid justify-items-start gap-3">
          <p className="text-muted-foreground">
            Nothing came through from the share. Try sharing it again.
          </p>
          <Button variant="outline" asChild>
            <Link to="/">Go to Today</Link>
          </Button>
        </div>
      ) : (
        <div className="grid max-w-xl gap-3 sm:grid-cols-2">
          <Link
            to={`/pantry/receipt?shared=${id}`}
            replace
            className="grid justify-items-start gap-2 rounded-3xl border bg-card p-5 outline-none hover:bg-accent/40 focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            <span className="flex size-10 items-center justify-center rounded-2xl bg-accent text-accent-foreground">
              <HugeiconsIcon icon={Invoice01Icon} strokeWidth={2} />
            </span>
            <span className="font-medium">A receipt</span>
            <span className="text-sm text-muted-foreground">
              What you bought goes in the pantry.
            </span>
          </Link>
          <button
            type="button"
            disabled={importing}
            onClick={asRecipe}
            className="grid justify-items-start gap-2 rounded-3xl border bg-card p-5 text-left outline-none hover:bg-accent/40 focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-70"
          >
            <span className="flex size-10 items-center justify-center rounded-2xl bg-accent text-accent-foreground">
              {importing ? (
                <Spinner />
              ) : (
                <HugeiconsIcon icon={BookOpen01Icon} strokeWidth={2} />
              )}
            </span>
            <span className="font-medium">A recipe</span>
            <span className="text-sm text-muted-foreground">
              {importing ? "Reading it…" : "Added to your recipes."}
            </span>
          </button>
        </div>
      )}
    </>
  )
}
