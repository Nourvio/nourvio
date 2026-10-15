import * as React from "react"
import type { HouseholdEvent, Person } from "@mise/shared"
import { useQueryClient } from "@tanstack/react-query"

import { useCurrentUser } from "@/features/auth/current-user"

import { LIST_KEY } from "./use-list"

/**
 * Keeps the list live while it's open: someone else's change is fetched a
 * moment later, and this says who else has it open.
 */
export function useLiveList() {
  const me = useCurrentUser()
  const queryClient = useQueryClient()
  const [others, setOthers] = React.useState<Person[]>([])

  React.useEffect(() => {
    if (typeof EventSource === "undefined") return
    const source = new EventSource("/api/events?page=list")
    const read = (message: MessageEvent<string>) =>
      JSON.parse(message.data) as HouseholdEvent
    const refresh = () => {
      void queryClient.invalidateQueries({ queryKey: LIST_KEY })
      // Putting things away moves them to the pantry.
      void queryClient.invalidateQueries({ queryKey: ["pantry"] })
    }

    source.addEventListener("list", (message) => {
      const event = read(message)
      if (event.type === "list" && event.by !== me.id) refresh()
    })
    source.addEventListener("presence", (message) => {
      const event = read(message)
      if (event.type === "presence") {
        setOthers(event.people.filter((person) => person.id !== me.id))
      }
    })
    // Back after the connection dropped (a phone asleep in a pocket): catch
    // up on whatever changed meanwhile.
    let opened = false
    source.addEventListener("open", () => {
      if (opened) refresh()
      opened = true
    })
    return () => source.close()
  }, [me.id, queryClient])

  return others
}
