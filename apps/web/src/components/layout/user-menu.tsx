import {
  Home09Icon,
  Logout03Icon,
  Settings01Icon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { Link } from "@tanstack/react-router"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useMe, useSignOut, useSwitchHousehold } from "@/features/auth/use-me"
import { initials } from "@/lib/initials"

export function UserMenu() {
  const { t } = useTranslation()
  const me = useMe()
  const signOut = useSignOut()
  const switchHousehold = useSwitchHousehold()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            className="rounded-full"
            aria-label={t("account.menu")}
          />
        }
      >
        <Avatar>
          <AvatarFallback className="bg-accent text-accent-foreground">
            {initials(me.name)}
          </AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="grid gap-0.5">
            <span className="font-medium text-foreground">{me.name}</span>
            <span className="text-xs font-normal">
              {me.username ?? me.email}
            </span>
          </DropdownMenuLabel>
        </DropdownMenuGroup>

        {me.households.length > 1 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuLabel>{t("account.households")}</DropdownMenuLabel>
              <DropdownMenuRadioGroup
                value={me.activeHouseholdId ?? undefined}
                onValueChange={(id) =>
                  switchHousehold(id as string).catch(() =>
                    toast.error(t("account.switchFailed"))
                  )
                }
              >
                {me.households.map((household) => (
                  <DropdownMenuRadioItem
                    key={household.id}
                    value={household.id}
                  >
                    <HugeiconsIcon icon={Home09Icon} strokeWidth={2} />
                    {household.name}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuGroup>
          </>
        )}

        <DropdownMenuSeparator />
        <DropdownMenuItem render={<Link to="/settings" />}>
          <HugeiconsIcon icon={Settings01Icon} strokeWidth={2} />
          {t("nav.settings")}
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() =>
            signOut().catch(() => toast.error(t("account.signOutFailed")))
          }
        >
          <HugeiconsIcon icon={Logout03Icon} strokeWidth={2} />
          {t("account.signOut")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
