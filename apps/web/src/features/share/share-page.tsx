import * as React from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import { Alert02Icon } from "@hugeicons/core-free-icons"
import type { ImportResult, ShareResult } from "@mise/shared"
import { Link, useNavigate, useSearchParams } from "react-router"
import { toast } from "sonner"

import { PageHeader } from "@/components/layout/page-header"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { ApiError, api, apiUpload } from "@/lib/api"

import { forgetShared, readShared } from "./shared-files"

type Step =
  | { state: "working"; what: string; detail?: string }
  | { state: "failed"; message: string; link?: string }
  | { state: "unknown"; got: string }
  | { state: "unsupported" }

const hostOf = (link: string) => {
  try {
    return new URL(link).hostname.replace(/^(www|m|vm)\./, "")
  } catch {
    return "the link"
  }
}

const VIDEO_SITES = /(tiktok|instagram|youtube|youtu\.be|facebook|fb\.watch)/i

/**
 * Something shared into Nourvio, worked out on its own: a link (a recipe page
 * or a video) is imported, a receipt opens its review, and photos or text of
 * a recipe become one. `?link=` and `?inbox=` come from the server (an
 * iPhone Shortcut), `?id=` from the service worker (Android).
 */
export function SharePage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const link = params.get("link")
  const inbox = params.get("inbox")
  const cached = params.get("id")
  const [step, setStep] = React.useState<Step>(() =>
    params.get("unsupported")
      ? { state: "unsupported" }
      : { state: "working", what: "Opening what you shared…" }
  )

  const started = React.useRef<string | null>(null)
  React.useEffect(() => {
    const key = link ?? inbox ?? cached
    if (!key || started.current === key) return
    started.current = key

    const fail = (error: unknown, failedLink?: string) =>
      setStep({
        state: "failed",
        message: error instanceof ApiError ? error.message : "That didn't work",
        link: failedLink,
      })

    async function importLink(url: string) {
      setStep({
        state: "working",
        what: `Importing the recipe from ${hostOf(url)}…`,
        detail: VIDEO_SITES.test(url)
          ? "Videos take a minute or two: Nourvio watches and listens for the recipe."
          : undefined,
      })
      try {
        const result = await api<ImportResult>("/import/url", {
          body: { url },
        })
        if (result.duplicate) toast.success("Already in your recipes")
        navigate(`/recipes/${result.recipe.slug}`, { replace: true })
      } catch (error) {
        fail(error, url)
      }
    }

    async function openShared(id: string) {
      setStep({ state: "working", what: "Reading what you shared…" })
      try {
        const { result } = await api<{ result: ShareResult }>(`/share/${id}`, {
          method: "POST",
        })
        if (result.kind === "link") return importLink(result.link)
        if (result.kind === "receipt") {
          return navigate(`/pantry/receipt?id=${result.id}`, { replace: true })
        }
        if (result.kind === "recipe") {
          toast.success(`Added ${result.name} to your recipes`)
          return navigate(`/recipes/${result.slug}`, { replace: true })
        }
        setStep({ state: "unknown", got: result.got })
      } catch (error) {
        fail(error)
      }
    }

    async function handOver(id: string) {
      const shared = await readShared(id)
      if (!shared || (!shared.files.length && !shared.text)) {
        setStep({
          state: "failed",
          message: "Nothing came through from the share. Try sharing it again.",
        })
        return
      }
      const form = new FormData()
      for (const file of shared.files) form.append("file", file)
      if (shared.text) form.append("text", shared.text)
      try {
        const { url } = await apiUpload<{ url: string }>("/share", form)
        void forgetShared(id)
        const next = new URL(url, location.origin)
        const nextLink = next.searchParams.get("link")
        const nextInbox = next.searchParams.get("inbox")
        if (nextLink) await importLink(nextLink)
        else if (nextInbox) await openShared(nextInbox)
        // Several links: they're importing already.
        else navigate(next.pathname, { replace: true })
      } catch (error) {
        fail(error)
      }
    }

    if (link) void importLink(link)
    else if (inbox) void openShared(inbox)
    else if (cached) void handOver(cached)
  }, [link, inbox, cached, navigate])

  if (!link && !inbox && !cached && step.state === "working") {
    return (
      <>
        <PageHeader title="Shared to Nourvio" />
        <p className="text-muted-foreground">Nothing was shared.</p>
      </>
    )
  }

  return (
    <>
      <PageHeader title="Shared to Nourvio" />
      {step.state === "working" ? (
        <div className="grid max-w-xl gap-1.5">
          <p className="flex items-center gap-2 font-medium">
            <Spinner /> {step.what}
          </p>
          {step.detail && (
            <p className="text-sm text-muted-foreground">{step.detail}</p>
          )}
        </div>
      ) : step.state === "unsupported" ? (
        <p className="max-w-xl text-muted-foreground">
          Sharing into Nourvio needs it opened at its https address (your
          Cloudflare tunnel, say), installed to the home screen from there.
        </p>
      ) : (
        <div className="grid max-w-xl justify-items-start gap-3">
          <p className="flex gap-2 text-muted-foreground">
            <HugeiconsIcon
              icon={Alert02Icon}
              strokeWidth={2}
              className="mt-0.5 size-4 shrink-0"
            />
            {step.state === "unknown"
              ? `Nourvio couldn't tell what that was: it doesn't look like a receipt, a recipe or a link. It got ${step.got}.`
              : step.message}
          </p>
          <div className="flex flex-wrap gap-2">
            {step.state === "failed" && step.link ? (
              <Button asChild>
                <Link to={`/recipes?url=${encodeURIComponent(step.link)}`}>
                  Try it in the import window
                </Link>
              </Button>
            ) : (
              <>
                <Button variant="outline" asChild>
                  <Link to="/pantry/receipt">Scan a receipt</Link>
                </Button>
                <Button variant="outline" asChild>
                  <Link to="/recipes?import=photo">Add a recipe</Link>
                </Button>
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}
