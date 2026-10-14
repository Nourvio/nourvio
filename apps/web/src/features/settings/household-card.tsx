import * as React from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import { Add01Icon, MoreHorizontalIcon } from "@hugeicons/core-free-icons"
import {
  createUserInput,
  passwordSchema,
  type Role,
  type User,
} from "@mise/shared"
import { toast } from "sonner"
import { z } from "zod"

import { TextField } from "@/components/form/text-field"
import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { useCurrentUser } from "@/features/auth/current-user"
import { ApiError } from "@/lib/api"
import { useForm } from "@/lib/form"
import { initials } from "@/lib/initials"

import {
  useAddMember,
  useHousehold,
  useRemoveMember,
  useUpdateMember,
} from "./use-household"

export function HouseholdCard() {
  const me = useCurrentUser()
  const isAdmin = me.role === "admin"
  const household = useHousehold(isAdmin)

  return (
    <Card>
      <CardHeader>
        <CardTitle>Household</CardTitle>
        <CardDescription>
          {isAdmin
            ? "Everyone here shares the same recipes, plans and lists."
            : "Everyone shares the same recipes, plans and lists. Ask an admin to add or remove people."}
        </CardDescription>
        {isAdmin && (
          <CardAction>
            <AddMemberDialog />
          </CardAction>
        )}
      </CardHeader>
      {isAdmin && (
        <CardContent>
          {household.isPending ? (
            <div className="grid gap-3">
              <Skeleton className="h-14" />
              <Skeleton className="h-14" />
            </div>
          ) : household.isError ? (
            <p className="text-sm text-muted-foreground">
              Couldn't load the household.
            </p>
          ) : (
            <ItemGroup className="gap-2">
              {household.data.map((user) => (
                <MemberRow
                  key={user.id}
                  user={user}
                  isYou={user.id === me.id}
                />
              ))}
            </ItemGroup>
          )}
        </CardContent>
      )}
    </Card>
  )
}

function MemberRow({ user, isYou }: { user: User; isYou: boolean }) {
  const updateMember = useUpdateMember()
  const [resetting, setResetting] = React.useState(false)
  const [removing, setRemoving] = React.useState(false)
  const newRole = user.role === "admin" ? "member" : "admin"

  function changeRole() {
    updateMember.mutate(
      { id: user.id, role: newRole },
      {
        onSuccess: () =>
          toast.success(
            newRole === "admin"
              ? `${user.displayName} is now an admin`
              : `${user.displayName} is now a member`
          ),
        onError: (error) =>
          toast.error(
            error instanceof ApiError
              ? error.message
              : "Couldn't change their role"
          ),
      }
    )
  }

  return (
    <Item variant="outline">
      <ItemMedia>
        <Avatar size="lg">
          <AvatarFallback>{initials(user.displayName)}</AvatarFallback>
        </Avatar>
      </ItemMedia>
      <ItemContent>
        <ItemTitle>
          {user.displayName}
          {isYou && <span className="text-muted-foreground">(you)</span>}
          {user.role === "admin" && <Badge variant="secondary">admin</Badge>}
        </ItemTitle>
        <ItemDescription>{user.username}</ItemDescription>
      </ItemContent>
      <ItemActions>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              aria-label={`Options for ${user.displayName}`}
            >
              <HugeiconsIcon icon={MoreHorizontalIcon} strokeWidth={2} />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={changeRole}>
              {newRole === "admin" ? "Make admin" : "Make member"}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setResetting(true)}>
              Reset password
            </DropdownMenuItem>
            {!isYou && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  variant="destructive"
                  onSelect={() => setRemoving(true)}
                >
                  Remove from household
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </ItemActions>
      <ResetPasswordDialog
        user={user}
        open={resetting}
        onOpenChange={setResetting}
      />
      <RemoveMemberDialog
        user={user}
        open={removing}
        onOpenChange={setRemoving}
      />
    </Item>
  )
}

function AddMemberDialog() {
  const [open, setOpen] = React.useState(false)
  const addMember = useAddMember()
  const form = useForm(createUserInput, {
    displayName: "",
    username: "",
    password: "",
    role: "member",
  })

  function onOpenChange(next: boolean) {
    setOpen(next)
    if (!next) form.reset()
  }

  function onSubmit(event: React.FormEvent) {
    event.preventDefault()
    const input = form.validate()
    if (!input) return
    addMember.mutate(input, {
      onSuccess: ({ user }) => {
        onOpenChange(false)
        toast.success(`${user.displayName} can sign in now`, {
          description: `Username: ${user.username}`,
        })
      },
      onError: form.showError,
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <HugeiconsIcon
            icon={Add01Icon}
            strokeWidth={2}
            data-icon="inline-start"
          />
          Add person
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={onSubmit} noValidate className="grid gap-6">
          <DialogHeader>
            <DialogTitle>Add someone to the household</DialogTitle>
            <DialogDescription>
              Give them the username and password. They can change the password
              in Settings.
            </DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <TextField
              id="member-name"
              label="Name"
              autoComplete="off"
              error={form.errors.displayName}
              {...form.bind("displayName")}
            />
            <TextField
              id="member-username"
              label="Username"
              autoComplete="off"
              autoCapitalize="none"
              autoCorrect="off"
              error={form.errors.username}
              {...form.bind("username")}
            />
            <TextField
              id="member-password"
              label="Password"
              type="password"
              autoComplete="new-password"
              description="At least 10 characters."
              error={form.errors.password}
              {...form.bind("password")}
            />
            <Field>
              <FieldLabel htmlFor="member-role">Role</FieldLabel>
              <Select
                value={form.values.role}
                onValueChange={(role) =>
                  form.setValues((current) => ({
                    ...current,
                    role: role as Role,
                  }))
                }
              >
                <SelectTrigger id="member-role" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="member">
                    Member: recipes, plans and lists
                  </SelectItem>
                  <SelectItem value="admin">
                    Admin: also people and AI settings
                  </SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </FieldGroup>
          {form.formError && (
            <Alert variant="destructive">
              <AlertDescription>{form.formError}</AlertDescription>
            </Alert>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={addMember.isPending}>
              {addMember.isPending && <Spinner data-icon="inline-start" />}
              Add person
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

const resetInput = z.object({ password: passwordSchema })

function ResetPasswordDialog({
  user,
  open,
  onOpenChange,
}: {
  user: User
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const updateMember = useUpdateMember()
  const form = useForm(resetInput, { password: "" })

  function close(next: boolean) {
    onOpenChange(next)
    if (!next) form.reset()
  }

  function onSubmit(event: React.FormEvent) {
    event.preventDefault()
    const input = form.validate()
    if (!input) return
    updateMember.mutate(
      { id: user.id, password: input.password },
      {
        onSuccess: () => {
          close(false)
          toast.success(`New password set for ${user.displayName}`, {
            description: "They've been signed out on their devices.",
          })
        },
        onError: form.showError,
      }
    )
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={onSubmit} noValidate className="grid gap-6">
          <DialogHeader>
            <DialogTitle>Reset {user.displayName}'s password</DialogTitle>
            <DialogDescription>
              They'll be signed out everywhere and sign back in with this one.
            </DialogDescription>
          </DialogHeader>
          <TextField
            id={`reset-${user.id}`}
            label="New password"
            type="password"
            autoComplete="new-password"
            description="At least 10 characters."
            error={form.errors.password}
            {...form.bind("password")}
          />
          {form.formError && (
            <Alert variant="destructive">
              <AlertDescription>{form.formError}</AlertDescription>
            </Alert>
          )}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => close(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={updateMember.isPending}>
              {updateMember.isPending && <Spinner data-icon="inline-start" />}
              Set password
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function RemoveMemberDialog({
  user,
  open,
  onOpenChange,
}: {
  user: User
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const removeMember = useRemoveMember()

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove {user.displayName}?</AlertDialogTitle>
          <AlertDialogDescription>
            They'll lose access right away. Recipes, plans and lists stay.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={() =>
              removeMember.mutate(user.id, {
                onSuccess: () =>
                  toast.success(`${user.displayName} was removed`),
                onError: (error) =>
                  toast.error(
                    error instanceof ApiError
                      ? error.message
                      : "Couldn't remove them"
                  ),
              })
            }
          >
            Remove
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
