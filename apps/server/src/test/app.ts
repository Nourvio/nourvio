import { pino } from "pino"
import { createApp, type App } from "../app.ts"
import { createAuth } from "../services/auth/auth.ts"
import { SetupCode } from "../services/auth/setup-code.ts"
import { loadConfig } from "../core/config.ts"
import { createTestDatabase } from "./database.ts"

export const TEST_ORIGIN = "http://merran.test"
export const TEST_PASSWORD = "correct horse battery"

/** The whole app on a fresh test database. Close it when the tests are done. */
export async function createTestApp() {
  const { database, config: databaseConfig, close } = await createTestDatabase()
  const secret = "a test secret that is long enough to use"
  const config = {
    ...loadConfig({}),
    database: databaseConfig,
    secret,
    publicUrl: TEST_ORIGIN,
    webDir: null,
  }
  const auth = createAuth({ config, database, secret })
  const setupCode = new SetupCode()
  const app = createApp({
    config,
    logger: pino({ level: "silent" }),
    database,
    auth,
    setupCode,
  })
  return { app, database, auth, setupCode, close }
}

/** A response whose JSON tests can read without declaring its type. */
export type TestResponse = Omit<Response, "json"> & {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  json(): Promise<any>
}

/** One person's browser: it keeps their cookies between requests. */
export class TestClient {
  readonly app: App
  readonly cookies = new Map<string, string>()

  constructor(app: App) {
    this.app = app
  }

  async request(
    method: string,
    path: string,
    body?: unknown
  ): Promise<TestResponse> {
    const headers = new Headers({ origin: TEST_ORIGIN })
    if (this.cookies.size > 0) {
      headers.set(
        "cookie",
        [...this.cookies].map(([name, value]) => `${name}=${value}`).join("; ")
      )
    }
    if (body !== undefined) headers.set("content-type", "application/json")

    const res = await this.app.request(`${TEST_ORIGIN}${path}`, {
      method,
      headers,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    })
    for (const cookie of res.headers.getSetCookie()) {
      const [pair = ""] = cookie.split(";")
      const [name = "", ...rest] = pair.split("=")
      const value = rest.join("=")
      if (value === "" || /max-age=0/i.test(cookie)) this.cookies.delete(name)
      else this.cookies.set(name, value)
    }
    return res
  }

  get(path: string) {
    return this.request("GET", path)
  }
  post(path: string, body?: unknown) {
    return this.request("POST", path, body ?? {})
  }
  patch(path: string, body: unknown) {
    return this.request("PATCH", path, body)
  }
  delete(path: string) {
    return this.request("DELETE", path)
  }
}

export type TestAccount = {
  name: string
  email: string
  username: string
  password: string
}

export function account(username: string, name = username): TestAccount {
  return {
    name,
    email: `${username}@example.com`,
    username,
    password: TEST_PASSWORD,
  }
}

/** Sets the server up through the API: its first person, signed in. */
export async function setUpServer(
  app: App,
  setupCode: SetupCode,
  owner: TestAccount = account("kyle", "Kyle"),
  household = "Home"
) {
  const client = new TestClient(app)
  const res = await client.post("/api/auth/setup", {
    ...owner,
    code: setupCode.issue(),
    household,
  })
  if (res.status !== 201) {
    throw new Error(`Setup failed: ${res.status} ${await res.text()}`)
  }
  return client
}

/** Makes an invite link as `admin`, and returns its token. */
export async function inviteToken(admin: TestClient, role = "member") {
  const res = await admin.post("/api/households/current/invites", { role })
  if (res.status !== 201) {
    throw new Error(`Invite failed: ${res.status} ${await res.text()}`)
  }
  const { link } = (await res.json()) as { link: string }
  return link.split("/join/")[1]!
}

/** Someone new joins through an invite link, signed in afterwards. */
export async function join(app: App, token: string, who: TestAccount) {
  const client = new TestClient(app)
  const res = await client.post(`/api/auth/join/${token}`, { account: who })
  if (res.status !== 201) {
    throw new Error(`Join failed: ${res.status} ${await res.text()}`)
  }
  return client
}
