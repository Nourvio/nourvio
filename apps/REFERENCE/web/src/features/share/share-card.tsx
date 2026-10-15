import * as React from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import { Copy01Icon, Tick02Icon } from "@hugeicons/core-free-icons"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Spinner } from "@/components/ui/spinner"
import { useCreateExtensionToken } from "@/features/extension/use-extension"
import { ApiError } from "@/lib/api"

/** Something to type into the Shortcuts app, with a copy button. */
function Copyable({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = React.useState(false)
  return (
    <span className="flex min-w-0 items-center gap-1.5 rounded-xl bg-secondary py-1 pr-1 pl-3">
      <code className="min-w-0 flex-1 truncate text-xs">{value}</code>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label={`Copy ${label}`}
        onClick={() => {
          void navigator.clipboard?.writeText(value).then(() => {
            setCopied(true)
            window.setTimeout(() => setCopied(false), 1500)
          })
        }}
      >
        <HugeiconsIcon
          icon={copied ? Tick02Icon : Copy01Icon}
          strokeWidth={2}
        />
      </Button>
    </span>
  )
}

/**
 * Sharing receipts (and recipes) into Nourvio from other apps: Android's share
 * sheet once Nourvio is installed, and on iPhone a Shortcut with a key.
 */
export function ShareCard() {
  const create = useCreateExtensionToken()
  const [key, setKey] = React.useState<string | null>(null)
  const address = `${location.origin}/api/share`
  const secure = location.protocol === "https:"

  function makeKey() {
    create.mutate("iPhone Shortcut", {
      onSuccess: (made) => setKey(made.token),
      onError: (error) =>
        toast.error(
          error instanceof ApiError ? error.message : "Couldn't make a key"
        ),
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Share to Nourvio</CardTitle>
        <CardDescription>
          Share anything food to Nourvio and it works out the rest: a TikTok,
          Instagram or YouTube video or a recipe page becomes a recipe, a
          receipt from your email or photos goes to the pantry (with a look
          first), and a screenshot of a recipe becomes one too.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-6">
        <section className="grid gap-1.5">
          <h3 className="font-medium">Android</h3>
          <p className="text-sm text-muted-foreground">
            In Chrome, open the menu (⋮) and tap <b>Add to home screen</b> or{" "}
            <b>Install app</b>. Then, in any app, tap <b>Share</b> and pick{" "}
            <b>Nourvio</b>.
          </p>
          {!secure && (
            <p className="text-sm text-amber-700 dark:text-amber-400">
              This needs Nourvio opened at its https address, like your
              Cloudflare tunnel, not a local one.
            </p>
          )}
        </section>

        <section className="grid gap-3">
          <div className="grid gap-1.5">
            <h3 className="font-medium">iPhone and iPad</h3>
            <p className="text-sm text-muted-foreground">
              Apple only lets App Store apps into the share sheet, but a
              Shortcut can be there instead. It takes a few minutes to set up,
              once.
            </p>
          </div>
          {!key ? (
            <Button
              variant="outline"
              className="justify-self-start"
              disabled={create.isPending}
              onClick={makeKey}
            >
              {create.isPending && <Spinner data-icon="inline-start" />}
              Make a key for the Shortcut
            </Button>
          ) : (
            <ol className="grid list-decimal gap-3 pl-5 text-sm marker:text-muted-foreground">
              <li>
                Open <b>Shortcuts</b>, tap <b>+</b>, and name it{" "}
                <b>Send to Nourvio</b>.
              </li>
              <li>
                Tap the <b>ⓘ</b> button and turn on <b>Show in Share Sheet</b>.
              </li>
              <li>
                <div className="grid gap-1.5">
                  <span>
                    Add the action <b>Get Contents of URL</b> with this address:
                  </span>
                  <Copyable label="the address" value={address} />
                  <span>
                    Tap the arrow next to it: set <b>Method</b> to <b>POST</b>.
                    Under <b>Headers</b>, add <code>Authorization</code> with
                    this:
                  </span>
                  <Copyable label="the key" value={`Bearer ${key}`} />
                  <span>
                    Under <b>Request Body</b>, pick <b>Form</b>, add a{" "}
                    <b>File</b> field named <code>file</code>, and set it to{" "}
                    <b>Shortcut Input</b>.
                  </span>
                </div>
              </li>
              <li>
                Add <b>Get Dictionary Value</b>, for the key <code>url</code>.
              </li>
              <li>
                Add <b>Open URLs</b>.
              </li>
            </ol>
          )}
          {key && (
            <p className="text-sm text-muted-foreground">
              Now, from TikTok, Instagram, YouTube, Safari, Mail, Photos or
              Files, tap <b>Share</b> and then <b>Send to Nourvio</b>. Nourvio
              opens to finish it, signed in for you by a one-time link. The key
              is yours: someone in another household needs their own. It's
              listed with your connected extensions, where it can be removed.
            </p>
          )}
        </section>
      </CardContent>
    </Card>
  )
}
