import { HugeiconsIcon } from "@hugeicons/react"
import { Download01Icon } from "@hugeicons/core-free-icons"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { ApiError } from "@/lib/api"

import { useExtensionTokens, useRevokeExtensionToken } from "./use-extension"

/** Getting the Mise browser extension, and the browsers it's connected in. */
export function ExtensionCard() {
  const tokens = useExtensionTokens()
  const revoke = useRevokeExtensionToken()

  return (
    <Card>
      <CardHeader>
        <CardTitle>Browser extension</CardTitle>
        <CardDescription>
          For Chrome, Edge and other Chromium browsers on a computer. Import the
          recipe on any page with one click, even on sites that turn Mise away
          or need your subscription; right-click a link to import it; and keep
          the shopping list beside you while you shop online.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="grid gap-2">
          <Button className="justify-self-start" asChild>
            <a href="/api/extension/download" download>
              <HugeiconsIcon
                icon={Download01Icon}
                strokeWidth={2}
                data-icon="inline-start"
              />
              Download the extension
            </a>
          </Button>
          <ol className="grid list-decimal gap-1 pl-5 text-sm text-muted-foreground">
            <li>Unzip it somewhere it can stay.</li>
            <li>
              Open <code className="text-foreground">chrome://extensions</code>{" "}
              (or <code className="text-foreground">edge://extensions</code>)
              and turn on Developer mode.
            </li>
            <li>Click Load unpacked and pick the unzipped folder.</li>
            <li>
              Click the Mise icon in the toolbar, type this Mise's address, and
              click Connect.
            </li>
          </ol>
        </div>

        <div className="grid gap-2">
          <h3 className="text-sm font-medium">Connected browsers</h3>
          {tokens.isPending ? (
            <Skeleton className="h-10" />
          ) : !tokens.data?.length ? (
            <p className="text-sm text-muted-foreground">None yet.</p>
          ) : (
            <ul className="grid gap-1">
              {tokens.data.map((token) => (
                <li
                  key={token.id}
                  className="flex items-center justify-between gap-3 text-sm"
                >
                  <span>
                    {token.name}
                    <span className="text-muted-foreground">
                      {" "}
                      ·{" "}
                      {token.lastUsedAt
                        ? `used ${new Date(token.lastUsedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}`
                        : `connected ${new Date(token.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}`}
                    </span>
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={revoke.isPending}
                    onClick={() =>
                      revoke.mutate(token.id, {
                        onSuccess: () =>
                          toast.success(`Disconnected ${token.name}`),
                        onError: (error) =>
                          toast.error(
                            error instanceof ApiError
                              ? error.message
                              : "Couldn't disconnect it"
                          ),
                      })
                    }
                  >
                    Disconnect
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
