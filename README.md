# Mise

A self-hosted meal planner with an AI cooking assistant built in. Recipes, weekly plans, a pantry, shopping lists, nutrition and Walmart pickup orders for your household (and others you host), made to use from a phone or iPad while cooking.

**Status:** usable day to day. Recipes (imported from links, videos, text, photos or Mealie), AI tidy-ups, the assistant, households with invites, the meal plan, the shopping list, the pantry, nutrition (with grams for baking) and diet labels all work. Walmart ordering is parked while the app gets polished. See the [roadmap](docs/roadmap.md).

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

> **Docker Desktop on Windows:** Docker Compose 5 on Windows mistakes the GitHub URL for a folder path and fails with `failed to evaluate path "https://github.com/...`. Compose on Linux, which is what Dockge and Portainer use, builds from the URL fine. On Windows, clone the repo, set `MISE_BUILD_CONTEXT=.` in `.env`, and run the same command from the checkout.

### Check that it's running

`http://<your-server>:3000/api/health` should return:

```json
{ "status": "ok", "version": "dev", "database": "ok" }
```

`"database": "unavailable"` means the app can't reach Postgres. Check the `db` container's logs.

### First run: create your account

1. Open the app. It asks for a **setup code**.
2. Find the code in the app's log. In Dockge, open the `mise` container's logs; with the CLI, run `docker compose logs mise`. Look for:

   ```
   Welcome to Mise. Open the app to create the first
   account, and enter this setup code: ABCD-EFGH-JKMN
   ```

3. Enter the code with your name, a username, a password (at least 10 characters) and a name for your household. You'll run the server and be your household's admin.
4. Invite everyone else from **Settings → your household → Invite someone**. Each link works once, for 7 days; the person opens it and makes their own account. (For someone who won't open a link, like a kid, **Add without a link** lets you pick their username and password.)

**Other households.** One Mise can host several households, each with its own recipes and members, all using the server's AI keys. Invite someone as above and they join *your* household; to host another family, turn on **Settings → This server → Let anyone create an account**, and each sign-up starts a new household. Leave it off when the public link is on unless you need it, since anyone who finds the address could sign up. Settings → This server lists every household with its size and AI spending, and you can delete one.

The code changes every time the app restarts until the first account exists, and it stops working after that. It's there so a stranger who reaches the page before you can't claim it.

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
| `PUBLIC_URL` | none | The address people use to reach Mise from outside, such as `https://mise.example.com`. Set it when you turn on the tunnel. |
| `ANTHROPIC_API_KEY` | none | Claude API key. You can add it in the app under Settings instead; a key set here wins and can't be changed in the app. |
| `OPENAI_API_KEY` | none | OpenAI API key, same as above |
| `MISE_SECRET` | none | Encrypts API keys saved in the app. If empty, Mise creates a random one in `data/app/secret`. |
| `YTDLP_AUTO_UPDATE` | `true` | Mise updates its copy of yt-dlp (which reads video links) at startup and weekly. Set to `false` to stop that. |
| `USDA_API_KEY` | none | FoodData Central key for calculated nutrition, free from [api.data.gov](https://api.data.gov/signup/). Can also be added in Settings. |
| `TUNNEL_TOKEN` | none | Cloudflare Tunnel token, only if you enable the tunnel (below) |

## Your data

Everything lives in `./data`, next to `compose.yaml`:

| Folder | What's in it |
|---|---|
| `data/app` | App files: recipe photos, and `secret`, which encrypts saved API keys. Back it up with the database. |
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

## Moving from Mealie

In **Settings → Move from Mealie**, enter Mealie's address as the Mise server sees it (for example `http://192.168.1.20:9000`) and an API token from Mealie (your profile → API Tokens). **Connect** shows how many recipes there are; **Move** brings them over with photos, ratings and last-made dates. Running it again skips recipes already moved. Afterwards, **Settings → AI → Tidy up the whole library** can clean them up.

## Recipes from videos

Paste a TikTok, YouTube or Instagram link like any other. Mise reads the caption, the captions or (with an OpenAI key) the spoken words, and for short videos a few frames, then AI writes up the recipe. This needs an AI key, and the tools (yt-dlp and ffmpeg) come with the image.

**Instagram and the occasional YouTube video** want a signed-in session. To give Mise one, export a `cookies.txt` from a browser where you're signed in (a "Get cookies.txt" browser extension does this), and put it at `data/app/cookies.txt`. Use an account you don't mind being used this way; sites can limit accounts that fetch a lot.

**When video links stop working,** it's usually because a site changed. Mise updates yt-dlp weekly; restarting the stack makes it check right away.

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

Everything except the sign-in and setup pages needs a login, and repeated wrong passwords lock that username for 15 minutes. Create your account (above) before you turn the tunnel on, and give everyone a password that isn't used anywhere else.

## Developing

You need Node 24 and Docker (for a local Postgres).

```bash
npm install
```

```bash
cp .env.example .env
```

```bash
npm run db:up
```

```bash
npm run dev
```

- `.env` gives the API its `DATABASE_URL`. The example already points at the local database.
- `npm run db:up` starts that local Postgres in Docker.
- `npm run dev` starts the web app on http://localhost:5173 and the API on :3000. Vite forwards `/api` to the API. The setup code prints in the same terminal.
- `npm test` runs the server tests against an in-memory Postgres, so it doesn't need Docker.

More in [docs/development.md](docs/development.md).

## Docs

The plan and the reasoning behind it are in [`docs/`](docs/README.md): what we're building, the architecture, outside services, deployment, and how to work on the code.
