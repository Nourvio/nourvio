# Mise

Mise is a self-hosted meal planner for one household, with an AI cooking assistant built in. It replaces Mealie and covers:

- recipes
- weekly meal plans
- a pantry
- shopping lists
- nutrition
- Walmart pickup orders

It's designed to be used from a phone or iPad while cooking.

**Status:** the web app shell and theme are built (`apps/web`). The server and database aren't started yet.

## Docs

| Doc | What's in it |
|---|---|
| [product.md](product.md) | What we want: features, requirements, what's out of scope |
| [architecture.md](architecture.md) | How it's built: stack, project layout, data model, API, AI, UI |
| [integrations.md](integrations.md) | Outside services: recipe sites, Mealie, Claude and OpenAI, nutrition data, grocery stores, and why we dropped app connectors |
| [deployment.md](deployment.md) | Running it on TrueNAS and putting it on the internet safely |
| [development.md](development.md) | Local setup, commands, and code conventions |
| [roadmap.md](roadmap.md) | Build order, milestones, and open questions |

## Decisions so far

| Decision | Choice | Why |
|---|---|---|
| Build or adopt | Build our own and borrow ideas from Mealie | We want AI chat at the center. Mealie is AGPL, so we copy ideas, not code. |
| Language | TypeScript everywhere | The web app, server and Walmart browser extension share types and validation |
| UI | React, shadcn/ui, Tailwind CSS | shadcn gives us accessible components we own and can restyle. It has good mobile sheets and drawers. |
| Server | Hono on Node 24 | Small and fast, and streams chat responses easily |
| Database | PostgreSQL 18 through Drizzle ORM | The usual choice in compose stacks. Fuzzy matching and full-text search help with ingredients and recipe search, and there's room for AI-powered search later. |
| AI | Claude and OpenAI, called from the server with your own API keys | Keys go in Settings or environment variables. Chat, recipe import and cleanup all live inside the app. No ChatGPT or Claude app connectors (MCP). |
| Hosting | One Docker container on TrueNAS | Your hardware, your data |
| Grocery ordering | Walmart through a browser extension | Walmart has no public cart API. See [integrations.md](integrations.md#grocery-ordering). |
