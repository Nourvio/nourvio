import * as React from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Copy01Icon,
  Share08Icon,
  UserAdd01Icon,
} from "@hugeicons/core-free-icons"
import { INVITE_DAYS, type CreatedInvite, type Role } from "@mise/shared"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from "@/components/ui/item"
import { Spinner } from "@/components/ui/spinner"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { formatRelativeDate } from "@/features/recipes/format"
import { ApiError } from "@/lib/api"

import { useCreateInvite, useInvites, useRevokeInvite } from "./use-household"

const linkFor = (token: string) => `${window.location.origin}/join/${token}`

/** Make an invite link to text or share; it can only be shown once. */
export function InviteDialog({ householdName }: { householdName: string }) {
  const [open, setOpen] = React.useState(false)
  const [role, setRole] = React.useState<Role>("member")
  const [invite, setInvite] = React.useState<CreatedInvite | null>(null)
  const create = useCreateInvite()

  function onOpenChange(next: boolean) {
    setOpen(next)
    if (!next) {
      setInvite(null)
      setRole("member")
      create.reset()
    }
  }

  const link = invite ? linkFor(invite.token) : ""
  const canShare = typeof navigator !== "undefined" && "share" in navigator

  async function copy() {
    try {
      await navigator.clipboard.writeText(link)
      toast.success("Link copied")
    } catch {
      toast.error("Couldn't copy. Select the link and copy it instead.")
    }
  }

  async function share() {
    try {
      await navigator.share({
        title: `Join ${householdName} on Mise`,
        text: `Join ${householdName} on Mise to share recipes and meal plans:`,
        url: link,
      })
    } catch {
      // Closing the share sheet isn't an error worth showing.
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button>
          <HugeiconsIcon
            icon={UserAdd01Icon}
            strokeWidth={2}
            data-icon="inline-start"
          />
          Invite someone
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Invite someone</DialogTitle>
          <DialogDescription>
            {invite
              ? `Send this link to the person you're inviting. It works once, for ${INVITE_DAYS} days, and can't be shown again.`
              : `They'll get a link to make their own account in ${householdName}.`}
          </DialogDescription>
        </DialogHeader>

        {invite ? (
          <div className="grid gap-4">
            <Input
              readOnly
              value={link}
              aria-label="Invite link"
              onFocus={(event) => event.target.select()}
            />
            <DialogFooter>
              <Button variant="outline" onClick={copy}>
                <HugeiconsIcon
                  icon={Copy01Icon}
                  strokeWidth={2}
                  data-icon="inline-start"
                />
                Copy link
              </Button>
              {canShare && (
                <Button onClick={share}>
                  <HugeiconsIcon
                    icon={Share08Icon}
                    strokeWidth={2}
                    data-icon="inline-start"
                  />
                  Share
                </Button>
              )}
            </DialogFooter>
          </div>
        ) : (
          <div className="grid gap-5">
            <Field>
              <FieldLabel>They'll join as</FieldLabel>
              <ToggleGroup
                type="single"
                variant="outline"
                value={role}
                onValueChange={(value) => value && setRole(value as Role)}
                className="justify-start"
              >
                <ToggleGroupItem value="member">Member</ToggleGroupItem>
                <ToggleGroupItem value="admin">Admin</ToggleGroupItem>
              </ToggleGroup>
              <FieldDescription>
                Admins can invite and remove people and change household
                settings.
              </FieldDescription>
            </Field>
            {create.error && (
              <p className="text-sm text-destructive">
                {create.error instanceof ApiError
                  ? create.error.message
                  : "Couldn't make the link"}
              </p>
            )}
            <DialogFooter>
              <Button
                disabled={create.isPending}
                onClick={() => create.mutate(role, { onSuccess: setInvite })}
              >
                {create.isPending && <Spinner data-icon="inline-start" />}
                Make a link
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

const EXPIRES = new Intl.DateTimeFormat(undefined, {
  weekday: "long",
  month: "short",
  day: "numeric",
})

/** Links sent but not used yet, with a way to take one back. */
export function PendingInvites() {
  const invites = useInvites(true)
  const revoke = useRevokeInvite()
  if (!invites.data?.length) return null

  return (
    <div className="grid gap-2">
      <p className="text-sm font-medium">Waiting to join</p>
      <ItemGroup className="gap-2">
        {invites.data.map((invite) => (
          <Item key={invite.id} variant="muted" size="sm">
            <ItemContent>
              <ItemTitle>
                Invite link{invite.role === "admin" ? " (admin)" : ""}
              </ItemTitle>
              <ItemDescription>
                {[
                  invite.createdBy && `From ${invite.createdBy}`,
                  `made ${formatRelativeDate(invite.createdAt)}`,
                  `works until ${EXPIRES.format(new Date(invite.expiresAt))}`,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </ItemDescription>
            </ItemContent>
            <ItemActions>
              <Button
                size="sm"
                variant="ghost"
                disabled={revoke.isPending}
                onClick={() =>
                  revoke.mutate(invite.id, {
                    onSuccess: () => toast("Invite link turned off"),
                  })
                }
              >
                Turn off
              </Button>
            </ItemActions>
          </Item>
        ))}
      </ItemGroup>
    </div>
  )
}
