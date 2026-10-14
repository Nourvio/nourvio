# Mise

A self-hosted meal planner with an AI cooking assistant built in. Recipes, weekly plans, a pantry, shopping lists, nutrition and Walmart pickup orders for one household, made to use from a phone or iPad while cooking.

**Status:** early. The app shell, theme and server skeleton are in place; recipes and the rest come next. See the [roadmap](docs/roadmap.md).

## Run it with Docker Compose

Mise runs as a small compose stack: the app, Postgres, and a job that backs up the database every night. The app image builds straight from this GitHub repo, so you only need two files on the server: `compose.yaml` and a `.env`.

### With Dockge (or Portainer)

1. Create a new stack called `mise`.
2. Paste the contents of [`compose.yaml`](compose.yaml) into the compose editor.
3. Paste the contents of [`.env.example`](.env.example) into the `.env` editor and set `POSTGRES_PASSWORD` (see [Settings](#settings)).
4. Deploy. The first build takes a few minutes, because Docker clones the repo and builds the web app.
5. Open `http://<your-server>:3000`.

### With the Docker CLI

```bash
mkdir mise && cd mise
```

```bash
curl -fsSLO https://raw.githubusercontent.com/kjohnson2719/mise/main/compose.yaml
```

```bash
curl -fsSL -o .env https://raw.githubusercontent.com/kjohnson2719/mise/main/.env.example
```

Set `POSTGRES_PASSWORD` in `.env`, then start it:

```bash
docker compose up -d --build
```

### Check that it's running

`http://<your-server>:3000/api/health` should return:

```json
{ "status": "ok", "version": "dev", "database": "ok" }
```

`"database": "unavailable"` means the app can't reach Postgres. Check the `db` container's logs.

## Settings

Set these in `.env`, next to `compose.yaml`. Only `POSTGRES_PASSWORD` is required. Settings marked *later* belong to features that haven't shipped yet; it's safe to set them now.

| Variable | Default | What it does |
|---|---|---|
| `POSTGRES_PASSWORD` | **required** | Password for the bundled Postgres. Use letters and numbers only, because it goes into a connection URL. Generate one with `openssl rand -hex 24`. |
| `TZ` | `UTC` | Your timezone, for meal plan dates and backup file names. For example `America/Chicago`. |
| `MISE_PORT` | `3000` | Port on the host for the web app |
| `MISE_BUILD_CONTEXT` | `https://github.com/kjohnson2719/mise.git#main` | What to build. End it with `#<branch>`, `#<tag>` or `#<commit>`, or set it to `.` to build from a local checkout. |
| `PUID` / `PGID` | `1000` | User and group that own `./data/app` on the host. The app drops to this user at startup instead of running as root. |
| `BACKUP_KEEP_DAYS` | `14` | How many days of nightly backups to keep |
| `PUBLIC_URL` | none | *Later.* The address people use to reach Mise, such as `https://mise.example.com` |
| `ANTHROPIC_API_KEY` | none | *Later.* Claude API key. It will also be possible to add it in the app's Settings. |
| `OPENAI_API_KEY` | none | *Later.* OpenAI API key. It will also be possible to add it in the app's Settings. |
| `USDA_API_KEY` | none | *Later.* FoodData Central key for calculated nutrition, free from [api.data.gov](https://api.data.gov/signup/) |
| `TUNNEL_TOKEN` | none | Cloudflare Tunnel token, only if you enable the tunnel (below) |

## Your data

Everything lives in `./data`, next to `compose.yaml`:

| Folder | What's in it |
|---|---|
| `data/app` | App files (recipe photos, keys) |
| `data/postgres` | The database |
| `data/backups` | Nightly database dumps (`mise-YYYY-MM-DD.dump`) |

- **Backups:** back up the whole `data` folder, for example with ZFS snapshots of the dataset Dockge's stacks live on.
- **Restoring a dump:**
  1. Stop the `mise` container.
  2. Run:

     ```bash
     docker compose exec db-backup pg_restore --clean --if-exists -d mise /backups/mise-YYYY-MM-DD.dump
     ```
  3. Start the `mise` container again.

## Updating

The app rebuilds from the branch in `MISE_BUILD_CONTEXT` every time the stack starts, reusing Docker's cache for anything that didn't change.

- **Dockge:** use **Update**, or stop and start the stack.
- **Docker CLI:** `docker compose up -d --build`

To stay on a fixed version, point `MISE_BUILD_CONTEXT` at a tag or commit instead of `#main`.

Database changes run automatically when the app starts. The nightly dumps are your way back if an update goes wrong.

## Reaching it from outside your network (optional)

The compose file includes a [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/) service, which is turned off by default. A tunnel needs no open ports on your router.

1. In the Cloudflare dashboard, create a tunnel and copy its token.
2. Add a public hostname, such as `mise.example.com`, pointing to `http://mise:3000`.
3. Put the token in `TUNNEL_TOKEN` in `.env`.
4. Delete the `profiles: ["tunnel"]` line from the `cloudflared` service and redeploy. With the CLI you can run `docker compose --profile tunnel up -d` instead.
5. Set `PUBLIC_URL` to the hostname.

Mise doesn't have logins yet. Keep it off the public internet until accounts arrive (see the [roadmap](docs/roadmap.md)).

## Developing

You need Node 24. Docker is optional; it's only for the local Postgres.

```bash
npm install
```

```bash
npm run db:up
```

```bash
npm run dev
```

- `npm run db:up` starts a local Postgres.
- `npm run dev` starts the web app on http://localhost:5173 and the API on :3000. Vite forwards `/api` to the API.
- Copy `.env.example` to `.env` first if you want the API to connect to the local database.

More in [docs/development.md](docs/development.md).

## Docs

The plan and the reasoning behind it are in [`docs/`](docs/README.md): what we're building, the architecture, outside services, deployment, and how to work on the code.
