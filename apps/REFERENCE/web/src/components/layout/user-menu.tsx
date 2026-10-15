import { HugeiconsIcon } from "@hugeicons/react"
import {
  Logout03Icon,
  Settings01Icon,
  SparklesIcon,
} from "@hugeicons/core-free-icons"
import { Link } from "react-router"

import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useCurrentUser } from "@/features/auth/current-user"
import { useLogout } from "@/features/auth/use-session"
import { useUpdateAvailable } from "@/features/settings/use-updates"
import { initials } from "@/lib/initials"

export function UserMenu() {
  const me = useCurrentUser()
  const logout = useLogout()
  const updateReady = useUpdateAvailable()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative rounded-full"
          aria-label={
            updateReady ? "Your account (an update is ready)" : "Your account"
          }
        >
          <Avatar>
            <AvatarFallback className="bg-accent text-accent-foreground">
              {initials(me.displayName)}
            </AvatarFallback>
          </Avatar>
          {updateReady && (
            <span className="absolute top-0.5 right-0.5 size-2.5 rounded-full bg-primary ring-2 ring-background" />
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="grid gap-0.5">
          <span className="font-medium text-foreground">{me.displayName}</span>
          <span className="text-xs font-normal">{me.username}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {updateReady && (
          <DropdownMenuItem asChild>
            <Link to="/settings#updates" className="font-medium text-primary">
              <HugeiconsIcon
                icon={SparklesIcon}
                strokeWidth={2}
                className="text-primary"
              />
              An update is ready
            </Link>
          </DropdownMenuItem>
        )}
        <DropdownMenuItem asChild>
          <Link to="/settings">
            <HugeiconsIcon icon={Settings01Icon} strokeWidth={2} />
            Settings
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => logout.mutate()}>
          <HugeiconsIcon icon={Logout03Icon} strokeWidth={2} />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
