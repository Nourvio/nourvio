import { readdirSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { describe, expect, test } from "vitest"
import type { AppDeps } from "../core/context.ts"
import { createRouter, type RegisterRoutes } from "./router.ts"
import registerAllRoutes from "./routes/index.ts"

// The routes folder mirrors the API: every `/` in a route's path is a
// folder, the last part is the file, named with the method, and a `{param}`
// is `[param]`. So PATCH /api/households/current/members/{memberId} lives in
// routes/households/current/members/[memberId].patch.ts. Each folder's
// index.ts only registers its routes and its subfolders' index.ts.
// auth/better-auth.ts is a registration file too: it hands the Better Auth
// endpoints Merran uses to Better Auth, rather than defining routes itself.

const ROUTES = fileURLToPath(new URL("./routes/", import.meta.url))

/** Files that register routes rather than being one. */
const REGISTRATION_FILES = ["auth/better-auth.ts"]
const isIndex = (name: string) =>
  name === "index.ts" || name.endsWith("/index.ts")

/** Registering only reads deps inside handlers, so none are needed here. */
const deps = {} as AppDeps

function routeFiles(folder = ROUTES, prefix = ""): string[] {
  return readdirSync(folder, { withFileTypes: true }).flatMap((entry) => {
    const name = `${prefix}${entry.name}`
    if (entry.isDirectory()) {
      return routeFiles(join(folder, entry.name), `${name}/`)
    }
    const isRoute =
      entry.name.endsWith(".ts") &&
      !isIndex(name) &&
      !REGISTRATION_FILES.includes(name) &&
      !entry.name.endsWith(".test.ts")
    return isRoute ? [name] : []
  })
}

function routesIn(register: RegisterRoutes) {
  const router = createRouter()
  register(router, deps)
  return router.openAPIRegistry.definitions.flatMap((definition) =>
    definition.type === "route"
      ? [{ method: definition.route.method, path: definition.route.path }]
      : []
  )
}

/** Where a route's file belongs, from its method and path. */
function fileFor({ method, path }: { method: string; path: string }) {
  const route = path.replace(/^\//, "").replace(/\{(\w+)\}/g, "[$1]")
  return `${route}.${method}.ts`
}

describe("the routes folder", () => {
  test.each(routeFiles())(
    "%s holds one route, at the path its place says",
    async (file) => {
      const url = pathToFileURL(join(ROUTES, ...file.split("/")))
      const { default: register } = (await import(url.href)) as {
        default: RegisterRoutes
      }

      const routes = routesIn(register)
      expect(routes, `${file} should define exactly one route`).toHaveLength(1)
      expect(fileFor(routes[0]!)).toBe(file)
    }
  )

  test("every route file is registered, through the index files", () => {
    const registered = routesIn(registerAllRoutes).map(fileFor).sort()

    expect(registered).toEqual(routeFiles().sort())
  })
})
