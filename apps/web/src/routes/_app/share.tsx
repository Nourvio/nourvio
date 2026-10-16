import { createFileRoute } from "@tanstack/react-router"

import { SharePage, type ShareSearch } from "@/features/share/share-page"

const asText = (value: unknown) =>
  typeof value === "string" && value.trim() ? value.trim() : undefined

/** Where Android's share sheet opens Merran (see the manifest's share target). */
export const Route = createFileRoute("/_app/share")({
  validateSearch: (search: Record<string, unknown>): ShareSearch => {
    const title = asText(search.title)
    const text = asText(search.text)
    const url = asText(search.url)
    return {
      ...(title ? { title } : {}),
      ...(text ? { text } : {}),
      ...(url ? { url } : {}),
    }
  },
  component: ShareRoute,
})

function ShareRoute() {
  return <SharePage search={Route.useSearch()} />
}
