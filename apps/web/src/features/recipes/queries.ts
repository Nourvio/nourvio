import {
  infiniteQueryOptions,
  queryOptions,
  useQueryClient,
} from "@tanstack/react-query"

import { api, unwrap, type Schemas } from "@/lib/api/client"

export type RecipeSummary = Schemas["RecipeSummary"]
export type Recipe = Schemas["Recipe"]
export type RecipeInput = Schemas["RecipeInput"]
export type RecipeVersion = Schemas["RecipeVersion"]
export type DeletedRecipe = Schemas["DeletedRecipe"]
export type Tag = Schemas["Tag"]

export const RECIPE_SORTS = ["newest", "name", "updated", "rating"] as const
export type RecipeSort = (typeof RECIPE_SORTS)[number]

/**
 * What the Recipes page is showing, as kept in its address. Tags are one
 * comma-separated value ("Baking,Dinner"), since a tag can't have a comma.
 */
export type RecipeSearch = {
  q?: string
  tags?: string
  sort?: RecipeSort
}

/** The tags a search is for, as a list. */
export function searchTags(search: RecipeSearch): string[] {
  return (search.tags ?? "")
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean)
}

const PAGE = 48

export const recipesQuery = (search: RecipeSearch) =>
  infiniteQueryOptions({
    queryKey: ["recipes", "list", search],
    queryFn: ({ pageParam }) =>
      unwrap(
        api.GET("/api/recipes", {
          params: {
            query: {
              ...(search.q ? { q: search.q } : {}),
              ...(searchTags(search).length > 0
                ? { tag: searchTags(search) }
                : {}),
              sort: search.sort ?? "newest",
              limit: PAGE,
              offset: pageParam,
            },
          },
        })
      ),
    initialPageParam: 0,
    getNextPageParam: (last, pages) => {
      const loaded = pages.reduce((n, page) => n + page.recipes.length, 0)
      return loaded < last.total ? loaded : undefined
    },
  })

export const recipeQuery = (slug: string) =>
  queryOptions({
    queryKey: ["recipes", "detail", slug],
    queryFn: () =>
      unwrap(
        api.GET("/api/recipes/{recipe}", {
          params: { path: { recipe: slug } },
        })
      ),
  })

export const versionsQuery = (slug: string) =>
  queryOptions({
    queryKey: ["recipes", "versions", slug],
    queryFn: () =>
      unwrap(
        api.GET("/api/recipes/{recipe}/versions", {
          params: { path: { recipe: slug } },
        })
      ),
  })

export const deletedQuery = queryOptions({
  queryKey: ["recipes", "deleted"],
  queryFn: () => unwrap(api.GET("/api/recipes/deleted")),
})

export const tagsQuery = queryOptions({
  queryKey: ["tags"],
  queryFn: () => unwrap(api.GET("/api/recipes/tags")),
})

/** After any change to recipes: everything about them is loaded again. */
export function useRefreshRecipes() {
  const queryClient = useQueryClient()
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ["recipes"] }),
      queryClient.invalidateQueries({ queryKey: tagsQuery.queryKey }),
    ])
}
