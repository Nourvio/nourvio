import { createFileRoute, redirect } from "@tanstack/react-router"

import { meQuery } from "@/features/auth/queries"
import { AboutCard } from "@/features/server/about-card"
import { ErrorTrackingCard } from "@/features/server/error-tracking-card"
import {
  serverSettingsQuery,
  telemetryReportQuery,
} from "@/features/server/queries"
import { TelemetryCard } from "@/features/server/telemetry-card"

export const Route = createFileRoute("/_app/settings/server")({
  beforeLoad: async ({ context }) => {
    const me = await context.queryClient.ensureQueryData(meQuery)
    if (!me?.serverAdmin) throw redirect({ to: "/settings/you" })
  },
  loader: ({ context: { queryClient } }) =>
    Promise.all([
      queryClient.ensureQueryData(serverSettingsQuery),
      queryClient.ensureQueryData(telemetryReportQuery),
    ]),
  component: ServerSettings,
})

function ServerSettings() {
  return (
    <>
      <AboutCard />
      <ErrorTrackingCard />
      <TelemetryCard />
    </>
  )
}
