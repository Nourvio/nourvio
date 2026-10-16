import { Add01Icon, Link01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { Link, useNavigate } from "@tanstack/react-router"
import * as React from "react"
import { useForm } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import { TextField } from "@/components/form/text-field"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Spinner } from "@/components/ui/spinner"
import { api, ApiError, unwrap } from "@/lib/api/client"

import { useRefreshRecipes, type Recipe } from "./queries"
import { SeveralLinks } from "./several-links"

type Form = { url: string }

/**
 * Adding a recipe: from a link, which reads the recipe off the page, or by
 * typing it in.
 */
export function AddRecipeDialog({ trigger }: { trigger?: React.ReactElement }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const refresh = useRefreshRecipes()
  const [open, setOpen] = React.useState(false)
  // Several links at once, rather than one.
  const [several, setSeveral] = React.useState(false)
  const [already, setAlready] = React.useState<{
    recipe: Recipe
    url: string
  } | null>(null)
  const form = useForm<Form>({ defaultValues: { url: "" } })
  const { errors, isSubmitting } = form.formState

  async function importLink(url: string, force = false) {
    const result = await unwrap(
      api.POST("/api/recipes/import", { body: { url, force } })
    )
    if (result.duplicate) {
      setAlready({ recipe: result.recipe, url })
      return
    }
    await refresh()
    setOpen(false)
    toast.success(t("recipes.import.added", { name: result.recipe.name }))
    await navigate({
      to: "/recipes/$slug",
      params: { slug: result.recipe.slug },
    })
  }

  const onSubmit = form.handleSubmit(async ({ url }) => {
    try {
      await importLink(url.trim())
    } catch (error) {
      if (!(error instanceof ApiError)) throw error
      form.setError("url", { message: error.message })
    }
  })

  const [again, setAgain] = React.useState(false)
  async function importAgain() {
    if (!already) return
    setAgain(true)
    try {
      await importLink(already.url, true)
    } catch (error) {
      if (!(error instanceof ApiError)) throw error
      toast.error(error.message)
    } finally {
      setAgain(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) {
          setAlready(null)
          setSeveral(false)
          form.reset()
        }
      }}
    >
      <DialogTrigger
        render={
          trigger ?? (
            <Button>
              <HugeiconsIcon icon={Add01Icon} strokeWidth={2} />
              {t("recipes.add")}
            </Button>
          )
        }
      />
      <DialogContent className="sm:max-w-lg">
        {several ? (
          <SeveralLinks
            onBack={() => setSeveral(false)}
            onStarted={(importId) => {
              setOpen(false)
              setSeveral(false)
              void navigate({
                to: "/recipes/import/$importId",
                params: { importId },
              })
            }}
          />
        ) : already ? (
          <>
            <DialogHeader>
              <DialogTitle>{t("recipes.import.alreadyTitle")}</DialogTitle>
              <DialogDescription>
                {t("recipes.import.alreadyDescription", {
                  name: already.recipe.name,
                })}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={importAgain} disabled={again}>
                {again && <Spinner />}
                {t("recipes.import.again")}
              </Button>
              <Button
                render={
                  <Link
                    to="/recipes/$slug"
                    params={{ slug: already.recipe.slug }}
                    onClick={() => setOpen(false)}
                  />
                }
              >
                {t("recipes.import.open")}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <form onSubmit={onSubmit} noValidate className="grid gap-6">
            <DialogHeader>
              <DialogTitle>{t("recipes.add")}</DialogTitle>
              <DialogDescription>
                {t("recipes.import.description")}
              </DialogDescription>
            </DialogHeader>
            <TextField
              label={t("recipes.import.link")}
              type="url"
              inputMode="url"
              placeholder="https://"
              autoFocus
              error={errors.url?.message}
              {...form.register("url", {
                validate: (value) =>
                  value.trim() !== "" || t("recipes.import.linkNeeded"),
              })}
            />
            <Button
              type="button"
              variant="link"
              className="-mt-3 justify-self-start px-0"
              onClick={() => setSeveral(true)}
            >
              {t("recipes.import.several")}
            </Button>
            <DialogFooter className="items-center sm:justify-between">
              <Button
                variant="link"
                className="px-0"
                render={
                  <Link to="/recipes/new" onClick={() => setOpen(false)} />
                }
              >
                {t("recipes.import.typeIt")}
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? (
                  <Spinner />
                ) : (
                  <HugeiconsIcon icon={Link01Icon} strokeWidth={2} />
                )}
                {isSubmitting
                  ? t("recipes.import.reading")
                  : t("recipes.import.submit")}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
