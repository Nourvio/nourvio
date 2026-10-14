/** The Mise this extension is connected to, kept in the extension's storage. */
export type Connection = {
  /** "https://mise.example.com" */
  origin: string
  token: string
  /** The token's id, to disconnect it in Mise too. */
  tokenId: string | null
  /** Whose Mise it is. */
  name: string
}

export async function getConnection(): Promise<Connection | null> {
  const { connection } = await chrome.storage.local.get("connection")
  return (connection as Connection | undefined) ?? null
}

export async function setConnection(connection: Connection | null) {
  if (connection) await chrome.storage.local.set({ connection })
  else await chrome.storage.local.remove("connection")
}

export class MiseError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

/** A Mise API call as the connected person (their extension token). */
export async function mise<T>(
  path: string,
  init: { method?: string; body?: unknown; connection?: Connection } = {}
): Promise<T> {
  const connection = init.connection ?? (await getConnection())
  if (!connection) {
    throw new MiseError(0, "Connect the extension to your Mise first.")
  }
  let res: Response
  try {
    res = await fetch(`${connection.origin}/api${path}`, {
      method: init.method ?? (init.body === undefined ? "GET" : "POST"),
      headers: {
        authorization: `Bearer ${connection.token}`,
        ...(init.body === undefined
          ? {}
          : { "content-type": "application/json" }),
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    })
  } catch {
    throw new MiseError(0, `Couldn't reach ${new URL(connection.origin).host}.`)
  }
  const data = res.status === 204 ? null : await res.json().catch(() => null)
  if (!res.ok) {
    throw new MiseError(
      res.status,
      (data as { error?: string } | null)?.error ??
        `Mise answered ${res.status}.`
    )
  }
  return data as T
}

/** "mise.example.com" or a full link, as the origin to ask the browser for. */
export function originOf(input: string) {
  const text = input.trim()
  const url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`)
  return url.origin
}
