import * as React from "react"
import { Link } from "react-router"

import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { AuthLayout } from "@/features/auth/auth-layout"
import { useCurrentUser } from "@/features/auth/current-user"
import { ApiError } from "@/lib/api"

import {
  browserName,
  useCreateExtensionToken,
  useRevokeExtensionToken,
} from "./use-extension"

/** How long to wait for the extension to take the token. */
const WAIT_MS = 8000

type State =
  | { step: "ask" }
  | { step: "handing" }
  | { step: "done" }
  | { step: "failed"; message: string }

/**
 * The extension opens this page to connect: allowing it makes a token and
 * hands it to the extension, which listens on this page only.
 */
export function ConnectExtensionPage() {
  const me = useCurrentUser()
  const create = useCreateExtensionToken()
  const revoke = useRevokeExtensionToken()
  const [state, setState] = React.useState<State>({ step: "ask" })

  async function connect() {
    setState({ step: "handing" })
    let made: { token: string; info: { id: string } }
    try {
      made = await create.mutateAsync(browserName())
    } catch (error) {
      setState({
        step: "failed",
        message:
          error instanceof ApiError ? error.message : "Couldn't reach Nourvio",
      })
      return
    }
    const taken = await new Promise<boolean>((resolve) => {
      const onMessage = (event: MessageEvent) => {
        if (
          event.source === window &&
          event.origin === window.location.origin &&
          event.data?.source === "mise-extension" &&
          event.data?.type === "token-received"
        ) {
          finish(true)
        }
      }
      const send = () =>
        window.postMessage(
          {
            source: "mise",
            type: "extension-token",
            token: made.token,
            tokenId: made.info.id,
            name: me.displayName,
          },
          window.location.origin
        )
      const timer = window.setInterval(send, 300)
      const timeout = window.setTimeout(() => finish(false), WAIT_MS)
      function finish(ok: boolean) {
        window.clearInterval(timer)
        window.clearTimeout(timeout)
        window.removeEventListener("message", onMessage)
        resolve(ok)
      }
      window.addEventListener("message", onMessage)
      send()
    })
    if (taken) {
      setState({ step: "done" })
    } else {
      // Nothing took it: don't leave a token lying around.
      revoke.mutate(made.info.id)
      setState({
        step: "failed",
        message:
          "The extension didn't answer. Open it from the browser's toolbar and click Connect there; it opens this page for you.",
      })
    }
  }

  if (state.step === "done") {
    return (
      <AuthLayout
        title="The extension is connected"
        description="You can close this tab. Open the Nourvio extension from the toolbar on any recipe page."
      >
        <Button variant="outline" className="w-full" asChild>
          <Link to="/">Back to Nourvio</Link>
        </Button>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout
      title="Connect the Nourvio extension?"
      description={`It'll act as you, ${me.displayName}: importing recipes from pages you open, adding to the shopping list, and showing the list beside you while you shop. You can disconnect it in Settings any time.`}
    >
      {state.step === "failed" && (
        <p className="text-sm text-destructive">{state.message}</p>
      )}
      <div className="grid gap-2">
        <Button disabled={state.step === "handing"} onClick={connect}>
          {state.step === "handing" && <Spinner data-icon="inline-start" />}
          Connect
        </Button>
        <Button variant="ghost" asChild>
          <Link to="/">Not now</Link>
        </Button>
      </div>
    </AuthLayout>
  )
}
