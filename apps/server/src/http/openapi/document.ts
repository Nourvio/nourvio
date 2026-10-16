import type { OpenAPIHono } from "@hono/zod-openapi"
import type { AppEnv } from "../../core/context.ts"
import { AUTH_BASE, type Auth } from "../../services/auth/auth.ts"
import { BETTER_AUTH_ENDPOINTS } from "../routes/auth/better-auth.ts"

type Document = ReturnType<OpenAPIHono<AppEnv>["getOpenAPI31Document"]>
type Operation = Record<string, unknown>

/** Where the published spec says to send requests, until someone sets their own. */
export const DEFAULT_SERVER_URL = "http://localhost:3000"

const TAGS = [
  {
    name: "Sign-in",
    description:
      "Setting up the server, signing in and out, invite links and switching households. Signed-in requests carry the session cookie.",
  },
  {
    name: "API keys",
    description:
      "Keys for scripts and tools like Home Assistant. Each acts as its person in one household, with only the permissions it was given, and stops working if it expires, is revoked, or its person leaves the household.",
  },
  {
    name: "Households",
    description:
      "The household in use: its settings, its people and their roles, and invite links.",
  },
  {
    name: "Settings",
    description:
      "Settings for the server (its admin only) and the household in use. A setting from an environment variable is locked, and a secret is never sent back: only whether it's set, and its last four characters.",
  },
  {
    name: "Server",
    description:
      "Whether the server is up and ready, and which of Merran's optional parts are on. No sign-in needed.",
  },
]

/**
 * The whole API as one OpenAPI 3.1 document: Merran's routes, plus the
 * Better Auth endpoints Merran exposes, described by Better Auth itself.
 * The same document is served at /api/openapi.json and saved as
 * openapi.json for docs sites.
 */
export async function buildOpenApiDocument(
  app: OpenAPIHono<AppEnv>,
  auth: Auth,
  { version, serverUrl }: { version: string; serverUrl: string }
): Promise<Document> {
  const document = app.getOpenAPI31Document({
    openapi: "3.1.0",
    info: {
      title: "Merran API",
      version,
      description:
        "Everything the Merran app does, it does through this API: the same routes are open to scripts and to tools like Home Assistant. Tools use an API key: make one at `POST /api/auth/api-keys` while signed in, then send it as `Authorization: Bearer mrn_…`. Each route says whether a key can use it, and with which permission. Browsers sign in with `POST /api/auth/sign-in/username` and send the session cookie it sets.",
      license: {
        name: "AGPL-3.0-or-later",
        url: "https://www.gnu.org/licenses/agpl-3.0.html",
      },
    },
    servers: [
      {
        url: "{server}",
        description: "Your Merran",
        variables: {
          server: {
            default: serverUrl,
            description: "The address you reach Merran at",
          },
        },
      },
    ],
    tags: TAGS,
  })

  const betterAuth = (await auth.api.generateOpenAPISchema()) as unknown as {
    paths: Record<string, Record<string, Operation>>
    components?: { schemas?: Record<string, unknown> }
  }
  document.paths ??= {}
  const added: Operation[] = []
  for (const { method, path, signedIn } of BETTER_AUTH_ENDPOINTS) {
    const verb = method.toLowerCase()
    const operation = betterAuth.paths[path]?.[verb]
    if (!operation) {
      throw new Error(`Better Auth doesn't describe ${method} ${path}`)
    }
    const described = {
      ...operation,
      tags: ["Sign-in"],
      ...(signedIn ? { security: [{ session: [] }] } : {}),
    }
    document.paths[`${AUTH_BASE}${path}`] = {
      ...document.paths[`${AUTH_BASE}${path}`],
      [verb]: described,
    }
    added.push(described)
  }

  // Bring along only the schemas those endpoints refer to.
  const referenced = JSON.stringify(added)
  document.components ??= {}
  document.components.schemas ??= {}
  for (const [name, schema] of Object.entries(
    betterAuth.components?.schemas ?? {}
  )) {
    if (!referenced.includes(`"#/components/schemas/${name}"`)) continue
    if (name in document.components.schemas) {
      throw new Error(`Better Auth's ${name} schema clashes with Merran's`)
    }
    document.components.schemas[name] = schema as never
  }

  return document
}
