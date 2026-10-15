import * as React from "react"
import {
  fieldErrors,
  joinSections,
  parseIngredient,
  recipeInput,
  splitSections,
  type Recipe,
  type RecipeInput,
} from "@mise/shared"
import { useQueryClient } from "@tanstack/react-query"
import { Link, useNavigate, useParams } from "react-router"
import { toast } from "sonner"

import { TextField } from "@/components/form/text-field"
import { PageHeader } from "@/components/layout/page-header"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import { NotFoundPage } from "@/app/not-found-page"
import { ApiError, apiUpload } from "@/lib/api"

import { RecipeImage } from "./recipe-image"
import {
  RECIPES_KEY,
  useCreateRecipe,
  useRecipe,
  useUpdateRecipe,
} from "./use-recipes"

type Values = {
  name: string
  description: string
  servings: string
  yieldText: string
  prepMinutes: string
  cookMinutes: string
  totalMinutes: string
  tags: string
  ingredients: string
  steps: string
  notes: string
  sourceUrl: string
}

const NUMBER_FIELDS = [
  "servings",
  "prepMinutes",
  "cookMinutes",
  "totalMinutes",
] as const

function valuesFrom(recipe?: Recipe): Values {
  const text = (value: number | string | null | undefined) =>
    value === null || value === undefined ? "" : String(value)
  return {
    name: recipe?.name ?? "",
    description: recipe?.description ?? "",
    servings: text(recipe?.servings),
    yieldText: recipe?.yieldText ?? "",
    prepMinutes: text(recipe?.prepMinutes),
    cookMinutes: text(recipe?.cookMinutes),
    totalMinutes: text(recipe?.totalMinutes),
    tags: recipe?.tags.join(", ") ?? "",
    ingredients: recipe
      ? joinSections(
          recipe.ingredients.map((i) => ({ section: i.section, text: i.text }))
        ).join("\n")
      : "",
    steps: recipe ? joinSections(recipe.steps).join("\n") : "",
    notes: recipe?.notes ?? "",
    sourceUrl: recipe?.sourceUrl ?? "",
  }
}

/** Turns the form's text into API input, or explains what's wrong. */
function toInput(
  values: Values,
  recipe?: Recipe
): { input: RecipeInput } | { errors: Record<string, string> } {
  const errors: Record<string, string> = {}
  const numbers: Partial<
    Record<(typeof NUMBER_FIELDS)[number], number | null>
  > = {}
  for (const field of NUMBER_FIELDS) {
    const raw = values[field].trim()
    if (!raw) {
      numbers[field] = null
      continue
    }
    const value = Number(raw)
    if (!Number.isFinite(value) || value < 0) {
      errors[field] = "Enter a number"
    } else {
      numbers[field] = field === "servings" ? value : Math.round(value)
    }
  }

  const lines = (text: string) => text.split("\n").map((line) => line.trimEnd())
  const input: RecipeInput = {
    name: values.name,
    description: values.description.trim() || null,
    servings: numbers.servings,
    yieldText: values.yieldText.trim() || null,
    prepMinutes: numbers.prepMinutes,
    cookMinutes: numbers.cookMinutes,
    totalMinutes: numbers.totalMinutes,
    notes: values.notes.trim() || null,
    sourceUrl: values.sourceUrl.trim() || null,
    rating: recipe?.rating ?? null,
    nutrition: recipe?.nutrition ?? null,
    tags: values.tags
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean),
    ingredients: lines(values.ingredients),
    steps: lines(values.steps),
  }

  const result = recipeInput.safeParse(input)
  if (!result.success) Object.assign(errors, fieldErrors(result.error))
  return Object.keys(errors).length ? { errors } : { input }
}

export function NewRecipePage() {
  return <RecipeEditor />
}

export function EditRecipePage() {
  const { slug = "" } = useParams()
  const recipe = useRecipe(slug)
  if (recipe.isPending) {
    return (
      <div className="grid gap-4 pt-8">
        <Skeleton className="h-10 w-1/2" />
        <Skeleton className="h-64" />
      </div>
    )
  }
  if (recipe.isError) return <NotFoundPage />
  return <RecipeEditor recipe={recipe.data} />
}

function RecipeEditor({ recipe }: { recipe?: Recipe }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const create = useCreateRecipe()
  const update = useUpdateRecipe(recipe?.id ?? "")
  const [values, setValues] = React.useState(() => valuesFrom(recipe))
  const [errors, setErrors] = React.useState<Record<string, string>>({})
  const [formError, setFormError] = React.useState<string | null>(null)
  const [photo, setPhoto] = React.useState<File | null>(null)
  const saving = create.isPending || update.isPending

  const bind = (name: keyof Values) => ({
    value: values[name],
    onChange: (
      event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
    ) => setValues((current) => ({ ...current, [name]: event.target.value })),
  })

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault()
    const result = toInput(values, recipe)
    if ("errors" in result) {
      setErrors(result.errors)
      setFormError("Check the highlighted fields.")
      return
    }
    setErrors({})
    setFormError(null)
    try {
      const saved = recipe
        ? await update.mutateAsync(result.input)
        : await create.mutateAsync(result.input)
      if (photo) await uploadPhoto(saved.id, photo)
      toast.success(recipe ? "Recipe saved" : "Recipe added")
      navigate(`/recipes/${saved.slug}`, { replace: true })
    } catch (error) {
      if (error instanceof ApiError) {
        setErrors(error.fields)
        setFormError(error.message)
      } else {
        setFormError("Something went wrong. Try again.")
      }
    }
  }

  async function uploadPhoto(id: string, file: File) {
    const form = new FormData()
    form.append("image", file)
    try {
      const { recipe: withPhoto } = await apiUpload<{ recipe: Recipe }>(
        `/recipes/${id}/image`,
        form
      )
      queryClient.setQueryData(["recipe", withPhoto.slug], withPhoto)
      queryClient.invalidateQueries({ queryKey: RECIPES_KEY })
    } catch {
      toast.error("The recipe saved, but the photo didn't upload")
    }
  }

  const ingredientCount = splitSections(values.ingredients.split("\n"), {
    colonHeadings: true,
  })
  const withAmounts = ingredientCount.filter(
    (item) => parseIngredient(item.text).quantity !== null
  ).length
  const stepCount = splitSections(values.steps.split("\n")).length
  const cancelTo = recipe ? `/recipes/${recipe.slug}` : "/recipes"

  return (
    <form onSubmit={onSubmit} noValidate className="pb-10">
      <PageHeader
        title={recipe ? "Edit recipe" : "New recipe"}
        actions={
          <>
            <Button variant="ghost" asChild>
              <Link to={cancelTo}>Cancel</Link>
            </Button>
            <Button type="submit" disabled={saving}>
              {saving && <Spinner data-icon="inline-start" />}
              Save
            </Button>
          </>
        }
      />
      {formError && (
        <Alert variant="destructive" className="mb-6">
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      )}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
        <Card className="h-fit">
          <CardHeader>
            <CardTitle className="text-lg font-semibold">Details</CardTitle>
          </CardHeader>
          <CardContent>
            <FieldGroup>
              <TextField
                id="recipe-name"
                label="Name"
                autoFocus={!recipe}
                error={errors.name}
                {...bind("name")}
              />
              <Field data-invalid={Boolean(errors.description) || undefined}>
                <FieldLabel htmlFor="recipe-description">
                  Description
                </FieldLabel>
                <Textarea
                  id="recipe-description"
                  rows={2}
                  placeholder="A line or two about it"
                  {...bind("description")}
                />
                {errors.description && (
                  <FieldError>{errors.description}</FieldError>
                )}
              </Field>
              <div className="grid grid-cols-2 gap-4">
                <TextField
                  id="recipe-servings"
                  label="Servings"
                  inputMode="decimal"
                  error={errors.servings}
                  {...bind("servings")}
                />
                <TextField
                  id="recipe-yield"
                  label="Makes"
                  placeholder="1 loaf"
                  error={errors.yieldText}
                  {...bind("yieldText")}
                />
              </div>
              <div className="grid grid-cols-3 gap-4">
                <TextField
                  id="recipe-prep"
                  label="Prep (min)"
                  inputMode="numeric"
                  error={errors.prepMinutes}
                  {...bind("prepMinutes")}
                />
                <TextField
                  id="recipe-cook"
                  label="Cook (min)"
                  inputMode="numeric"
                  error={errors.cookMinutes}
                  {...bind("cookMinutes")}
                />
                <TextField
                  id="recipe-total"
                  label="Total (min)"
                  inputMode="numeric"
                  error={errors.totalMinutes}
                  {...bind("totalMinutes")}
                />
              </div>
              <TextField
                id="recipe-tags"
                label="Tags"
                placeholder="dinner, chicken, weeknight"
                description="Separate with commas."
                error={errors.tags}
                {...bind("tags")}
              />
              <TextField
                id="recipe-source"
                label="Original link"
                type="url"
                inputMode="url"
                placeholder="https://"
                error={errors.sourceUrl}
                {...bind("sourceUrl")}
              />
              <Field>
                <FieldLabel htmlFor="recipe-notes">Notes</FieldLabel>
                <Textarea
                  id="recipe-notes"
                  rows={3}
                  placeholder="Swaps, tips, what to serve it with"
                  {...bind("notes")}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="recipe-photo">Photo</FieldLabel>
                {recipe?.imageUrl && !photo && (
                  <RecipeImage
                    src={recipe.thumbnailUrl}
                    alt={recipe.name}
                    className="aspect-[4/3] w-40 rounded-xl"
                  />
                )}
                <input
                  id="recipe-photo"
                  type="file"
                  accept="image/*"
                  onChange={(event) =>
                    setPhoto(event.target.files?.[0] ?? null)
                  }
                  className="text-sm file:mr-3 file:rounded-full file:border-0 file:bg-secondary file:px-4 file:py-2 file:text-sm file:font-medium file:text-secondary-foreground"
                />
                <FieldDescription>
                  {recipe?.imageUrl
                    ? "Choose a file to replace the current photo."
                    : "Optional. You can add one later too."}
                </FieldDescription>
              </Field>
            </FieldGroup>
          </CardContent>
        </Card>

        <div className="grid content-start gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg font-semibold">
                Ingredients
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Field data-invalid={Boolean(errors.ingredients) || undefined}>
                <Textarea
                  id="recipe-ingredients"
                  aria-label="Ingredients"
                  rows={10}
                  className="min-h-48 font-mono text-sm leading-relaxed"
                  placeholder={"2 cups flour\n1 tsp salt\n# Sauce\n1 cup cream"}
                  {...bind("ingredients")}
                />
                {errors.ingredients ? (
                  <FieldError>{errors.ingredients}</FieldError>
                ) : (
                  <FieldDescription>
                    One per line. Start a line with # for a section, like{" "}
                    <code># Sauce</code>.{" "}
                    {ingredientCount.length > 0 &&
                      `${ingredientCount.length} ingredient${ingredientCount.length === 1 ? "" : "s"}, ${withAmounts} with amounts that scale.`}
                  </FieldDescription>
                )}
              </Field>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-lg font-semibold">Steps</CardTitle>
            </CardHeader>
            <CardContent>
              <Field data-invalid={Boolean(errors.steps) || undefined}>
                <Textarea
                  id="recipe-steps"
                  aria-label="Steps"
                  rows={10}
                  className="min-h-48 leading-relaxed"
                  placeholder={
                    "Preheat the oven to 425°F.\nToss the vegetables with oil and salt.\nRoast for 25 minutes."
                  }
                  {...bind("steps")}
                />
                {errors.steps ? (
                  <FieldError>{errors.steps}</FieldError>
                ) : (
                  <FieldDescription>
                    One step per line. # starts a section here too.{" "}
                    {stepCount > 0 &&
                      `${stepCount} step${stepCount === 1 ? "" : "s"}.`}
                  </FieldDescription>
                )}
              </Field>
            </CardContent>
          </Card>
        </div>
      </div>
    </form>
  )
}
