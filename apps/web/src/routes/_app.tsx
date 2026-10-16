import { createFileRoute, redirect } from "@tanstack/react-router"

import { AppShell } from "@/components/layout/app-shell"
import { meQuery, setupQuery } from "@/features/auth/queries"

/** Every page inside the app: signed in, with the sidebar or tabs around it. */
export const Route = createFileRoute("/_app")({
  beforeLoad: async ({ context, location }) => {
    const me = await context.queryClient.ensureQueryData(meQuery)
    if (me) return

    const setup = await context.queryClient.fetchQuery(setupQuery)
    if (setup.needed) throw redirect({ to: "/setup" })
    throw redirect({ to: "/login", search: { redirect: location.href } })
  },
  component: AppShell,
})
