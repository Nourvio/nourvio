import { Link, useNavigate } from "@tanstack/react-router"
import * as React from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import { PageHeader } from "@/components/layout/page-header"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { useRefreshRecipes } from "@/features/recipes/queries"
import { api, ApiError, unwrap } from "@/lib/api/client"

/** What Android's share sheet hands over, as the manifest's share target asks. */
export type ShareSearch = { title?: string; text?: string; url?: string }

/** The site a shared link is on, for "Adding the recipe from example.com…". */
function siteOf({ title, text, url }: ShareSearch) {
  const link = [url, text, title].join(" ").match(/https?:\/\/[^\s<>"']+/)?.[0]
  if (!link) return null
  try {
    return new URL(link).hostname.replace(/^(?:www|m)\./, "")
  } catch {
    return null
  }
}

/**
 * Something shared to Merran from Android's share sheet: added, then on to
 * the recipe; or said why not.
 */
export function SharePage({ search }: { search: ShareSearch }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const refreshRecipes = useRefreshRecipes()
  const [failed, setFailed] = React.useState<string | null>(null)
  const nothing = !search.title && !search.text && !search.url

  // Once, even when React runs effects twice.
  const started = React.useRef(false)
  React.useEffect(() => {
    if (nothing || started.current) return
    started.current = true
    void (async () => {
      try {
        const result = await unwrap(
          api.POST("/api/share", {
            body: { title: search.title, text: search.text, url: search.url },
          })
        )
        if (result.outcome === "failed" || !result.recipe) {
          setFailed(result.message)
          return
        }
        const { name, slug } = result.recipe
        await refreshRecipes()
        toast.success(
          result.outcome === "added"
            ? t("share.added", { name })
            : t("share.already", { name })
        )
        // In place of this page, so going back doesn't share it again.
        await navigate({
          to: "/recipes/$slug",
          params: { slug },
          replace: true,
        })
      } catch (err) {
        if (!(err instanceof ApiError)) throw err
        setFailed(err.message)
      }
    })()
  }, [nothing, search, navigate, refreshRecipes, t])

  const site = siteOf(search)

  return (
    <>
      <PageHeader title={t("share.title")} />
      {nothing ? (
        <p className="text-muted-foreground">{t("share.nothing")}</p>
      ) : failed ? (
        <div className="grid max-w-xl justify-items-start gap-4">
          <Alert>
            <AlertTitle>{t("share.notAdded")}</AlertTitle>
            <AlertDescription>{failed}</AlertDescription>
          </Alert>
          <div className="flex flex-wrap gap-2">
            <Button render={<Link to="/recipes/new" />}>
              {t("share.addRecipe")}
            </Button>
            <Button variant="outline" render={<Link to="/recipes" />}>
              {t("share.toRecipes")}
            </Button>
          </div>
        </div>
      ) : (
        <p className="flex items-center gap-2 font-medium" aria-live="polite">
          <Spinner />
          {site ? t("share.adding", { site }) : t("share.addingSomething")}
        </p>
      )}
    </>
  )
}
