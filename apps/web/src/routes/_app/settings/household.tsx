import { Home01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { createFileRoute } from "@tanstack/react-router"
import { useTranslation } from "react-i18next"

import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { meQuery } from "@/features/auth/queries"
import { useActiveHousehold, useMe } from "@/features/auth/use-me"
import { DetailsCard } from "@/features/household/details-card"
import { InvitesCard } from "@/features/household/invites-card"
import { MembersCard } from "@/features/household/members-card"
import { NewHouseholdCard } from "@/features/household/new-household-card"
import {
  householdQuery,
  invitesQuery,
  isAdminRole,
  membersQuery,
} from "@/features/household/queries"

export const Route = createFileRoute("/_app/settings/household")({
  loader: async ({ context: { queryClient } }) => {
    const me = await queryClient.ensureQueryData(meQuery)
    const active = me?.households.find((h) => h.id === me.activeHouseholdId)
    if (!active) return
    await Promise.all([
      queryClient.ensureQueryData(householdQuery),
      queryClient.ensureQueryData(membersQuery),
      isAdminRole(active.role) && queryClient.ensureQueryData(invitesQuery),
    ])
  },
  component: HouseholdSettings,
})

function HouseholdSettings() {
  const { t } = useTranslation()
  const me = useMe()
  const household = useActiveHousehold()

  return (
    <>
      {household ? (
        <>
          <DetailsCard />
          <MembersCard />
          {isAdminRole(household.role) && <InvitesCard />}
        </>
      ) : (
        <Empty className="rounded-3xl border border-dashed">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <HugeiconsIcon icon={Home01Icon} strokeWidth={2} />
            </EmptyMedia>
            <EmptyTitle>{t("settings.household.none")}</EmptyTitle>
            <EmptyDescription>
              {t("settings.household.noneHint")}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
      {me.serverAdmin && <NewHouseholdCard />}
    </>
  )
}
