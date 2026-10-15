import type { HouseholdEvent, LivePage, Person } from "@mise/shared"

type Client = {
  userId: string
  name: string
  /** The page it has open, for "Jamie is on the list too". */
  page: LivePage | null
  send: (event: HouseholdEvent) => void
}

/**
 * Live changes for each household's open pages: something changed (the
 * list), and who else has a page open. In memory, for this server process.
 */
export function createEventBus() {
  const households = new Map<string, Set<Client>>()

  function here(householdId: string, page: LivePage): Person[] {
    const people = new Map<string, Person>()
    for (const client of households.get(householdId) ?? []) {
      if (client.page === page) {
        people.set(client.userId, { id: client.userId, name: client.name })
      }
    }
    return [...people.values()]
  }

  function sendPresence(householdId: string, page: LivePage) {
    const event: HouseholdEvent = {
      type: "presence",
      page,
      people: here(householdId, page),
    }
    for (const client of households.get(householdId) ?? []) {
      if (client.page === page) client.send(event)
    }
  }

  return {
    /** Tells everyone in the household; `by` is who made the change. */
    publish(householdId: string, event: HouseholdEvent) {
      for (const client of households.get(householdId) ?? []) {
        client.send(event)
      }
    },

    /** Listens until the returned function is called. */
    subscribe(householdId: string, client: Client) {
      const clients = households.get(householdId) ?? new Set()
      clients.add(client)
      households.set(householdId, clients)
      if (client.page) sendPresence(householdId, client.page)
      return () => {
        clients.delete(client)
        if (!clients.size) households.delete(householdId)
        if (client.page) sendPresence(householdId, client.page)
      }
    },
  }
}

export type EventBus = ReturnType<typeof createEventBus>
