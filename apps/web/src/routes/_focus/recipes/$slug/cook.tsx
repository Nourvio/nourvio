import { useSuspenseQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"

import { CookView } from "@/features/cook/cook-view"
import { recipeQuery } from "@/features/recipes/queries"

type CookSearch = {
  /** How many times the recipe, from the servings on its page. */
  scale?: number
}

export const Route = createFileRoute("/_focus/recipes/$slug/cook")({
  validateSearch: (search: Record<string, unknown>): CookSearch => {
    const scale = Number(search.scale)
    return scale > 0 && scale <= 100 && scale !== 1 ? { scale } : {}
  },
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(recipeQuery(params.slug)),
  component: CookPage,
})

function CookPage() {
  const { slug } = Route.useParams()
  const { scale = 1 } = Route.useSearch()
  const { data: recipe } = useSuspenseQuery(recipeQuery(slug))
  // Fresh for each recipe and scale, picking up where that one was left.
  return (
    <CookView key={`${recipe.id}-${scale}`} recipe={recipe} scale={scale} />
  )
}
