import * as React from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import { SparklesIcon } from "@hugeicons/core-free-icons"
import type { Recipe } from "@mise/shared"
import { useIsMutating, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { useAiStatus } from "@/features/settings/use-ai"
import { api, ApiError } from "@/lib/api"

import { RecipeImage } from "./recipe-image"
import { photoMutationKey, useRecipePhoto } from "./use-recipes"

/** A recipe this new may have a photo being made for it in the background. */
const NEW_RECIPE_MS = 2 * 60_000

/**
 * Making a photo with AI: for a recipe without one, or another go at an AI
 * one. Null when the server can't make photos (no OpenAI key).
 */
export function useMakePhoto(recipe: Recipe) {
  const ai = useAiStatus()
  const photo = useRecipePhoto(recipe.id)
  const making = useIsMutating({ mutationKey: photoMutationKey(recipe.id) }) > 0
  const can = Boolean(ai.data?.images) && (!recipe.imageUrl || recipe.photoByAi)

  function make() {
    photo.generate.mutate(undefined, {
      onSuccess: () => toast.success("Here's a photo for it"),
      onError: (error) =>
        toast.error(
          error instanceof ApiError ? error.message : "Couldn't make a photo"
        ),
    })
  }
  return { can, making, make }
}

/** The recipe's photo, with a way to make one, and a label on one made by AI. */
export function RecipePhoto({ recipe }: { recipe: Recipe }) {
  const ai = useAiStatus()
  const { can, making, make } = useMakePhoto(recipe)
  const waiting = useWaitForNewPhoto(recipe, Boolean(ai.data?.autoPhotos))
  const busy = making || (waiting && !recipe.imageUrl)

  return (
    <div className="relative">
      <RecipeImage
        src={recipe.imageUrl}
        alt={recipe.name}
        eager
        className="aspect-[4/3] w-full rounded-3xl"
      />
      {recipe.photoByAi && !busy && (
        <span className="absolute bottom-3 left-3 flex items-center gap-1 rounded-full bg-black/55 px-2.5 py-1 text-xs font-medium text-white backdrop-blur-sm">
          <HugeiconsIcon
            icon={SparklesIcon}
            strokeWidth={2}
            className="size-3"
          />
          AI photo
        </span>
      )}
      {busy ? (
        <div
          role="status"
          className="absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-3xl bg-background/70 text-center backdrop-blur-sm"
        >
          <Spinner className="size-6" />
          <p className="font-medium">Making a photo…</p>
          <p className="text-sm text-muted-foreground">
            This takes about half a minute.
          </p>
        </div>
      ) : (
        can &&
        !recipe.imageUrl && (
          <div className="absolute inset-x-0 bottom-0 flex justify-center p-4">
            <Button variant="secondary" onClick={make}>
              <HugeiconsIcon
                icon={SparklesIcon}
                strokeWidth={2}
                data-icon="inline-start"
              />
              Make a photo
            </Button>
          </div>
        )
      )}
    </div>
  )
}

/**
 * Whether the server is making a photo for a recipe just added without one
 * (when it makes photos for new recipes). Asks every few seconds until it's
 * done, then fetches the recipe again for the photo.
 */
function useWaitForNewPhoto(recipe: Recipe, autoPhotos: boolean) {
  const queryClient = useQueryClient()
  const [openedAt] = React.useState(() => Date.now())
  const isNew =
    autoPhotos &&
    !recipe.imageUrl &&
    openedAt - Date.parse(recipe.createdAt) < NEW_RECIPE_MS
  const status = useQuery({
    queryKey: ["recipe-photo-status", recipe.id],
    queryFn: () => api<{ making: boolean }>(`/recipes/${recipe.id}/photo`),
    enabled: isNew,
    refetchInterval: (query) => (query.state.data?.making ? 3000 : false),
    gcTime: 0,
  })
  const making = isNew && status.data?.making === true

  // Done (made, or failed): the recipe, and the library's cards, may have a photo now.
  const wasMaking = React.useRef(false)
  React.useEffect(() => {
    if (wasMaking.current && !making) {
      queryClient.invalidateQueries({ queryKey: ["recipe", recipe.id] })
      queryClient.invalidateQueries({ queryKey: ["recipe", recipe.slug] })
      queryClient.invalidateQueries({ queryKey: ["recipes"] })
    }
    wasMaking.current = making
  }, [making, queryClient, recipe.id, recipe.slug])

  return making
}
