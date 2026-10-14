# Deployment

How Mise runs on the home server and why it's set up this way. Step-by-step setup and the full list of settings are in the [README](../README.md#run-it-with-docker-compose). This page doesn't repeat them.

## The setup

- **Host:** the TrueNAS server, running Mise as a **Dockge** stack. Dockge is a plain `docker compose` front end, so nothing here is specific to Dockge or TrueNAS. Any machine with Docker Compose works the same way.
- **The stack**, defined in [`compose.yaml`](../compose.yaml):

| Service | Image | Purpose |
|---|---|---|
| `mise` | built from this repo | Serves the web app and the API on port 3000 |
| `db` | `postgres:18` | The database. It has no published port, so only the app can reach it. |
| `db-backup` | `postgres:18` | Runs `pg_dump` once a day into `./data/backups` |
| `cloudflared` | `cloudflare/cloudflared` | Optional Cloudflare Tunnel, off by default |

## How the image gets built

- **The compose file builds straight from GitHub.** `build.context` is the repo URL (`https://github.com/kjohnson2719/mise.git#main` by default, or whatever `MISE_BUILD_CONTEXT` says). Docker clones that ref and builds the [`Dockerfile`](../Dockerfile), so the server needs no checkout and no registry.
- **`pull_policy: build` rebuilds every time the stack starts.** That's what makes Dockge's Update button pick up new commits. Docker's build cache keeps the rebuild quick when little has changed.
- **Pinning a version:** point `MISE_BUILD_CONTEXT` at a tag (`#v0.3.0`) or a commit.
- **The Dockerfile has three stages:**
  1. Build the web app with Vite.
  2. Install only the server's production dependencies, about 6 MB.
  3. A `node:24-slim` runtime that runs the server's TypeScript directly. Node 24 strips the types, so there's no compile step.
- **CI** ([`.github/workflows/ci.yml`](../.github/workflows/ci.yml)) typechecks, lints and builds every push, and also builds the Docker image, so a broken Dockerfile shows up on GitHub before a deploy does.

## Data

Everything persistent is a bind mount under `./data`, next to the compose file, so it sits in the Dockge stack folder and is easy to see and snapshot:

| Path on the host | Mounted at | Holds |
|---|---|---|
| `data/app` | `/data` in `mise` | Recipe photos, and later the signing/encryption key (`secret`) |
| `data/postgres` | `/var/lib/postgresql` in `db` | The database files |
| `data/backups` | `/backups` in `db-backup` | Nightly dumps, `mise-YYYY-MM-DD.dump` |

- **Postgres 18 data path.** Postgres 18 changed where it keeps data. Mount `/var/lib/postgresql`, not the old `/var/lib/postgresql/data`, which fails on 18.
- **File ownership.**
  - The `mise` container starts as root only long enough to give `/data` to `PUID:PGID` (default `1000:1000`). Then it drops to that user, using [`docker/entrypoint.sh`](../docker/entrypoint.sh).
  - Setting `user:` on the service skips that step.
  - Postgres handles its own folder the same way.

## Security baseline

- **Database:** not published outside the compose network. It uses a long random password, letters and digits only, since it's embedded in a URL.
- **Not root:** the app runs as an unprivileged user.
- **Recipe import can't reach the home network.** The server won't fetch private-network addresses (see [integrations.md](integrations.md#recipe-sites)).
- **Secrets stay server-side:** API keys live only in the server's environment or, encrypted, in the database. They're never sent to the browser.
- **Logins:**
  - Every API route except `/api/health`, setup and sign-in needs a session.
  - Passwords are hashed with scrypt.
  - Five wrong passwords lock that username for 15 minutes, and one IP gets 20 tries per 15 minutes across all usernames.
- **Sessions:**
  - A session cookie is `HttpOnly`, `SameSite=Lax`, and `Secure` whenever the request arrived over HTTPS (the tunnel sets `X-Forwarded-Proto`).
  - It lasts 90 days from its last use.
  - The database stores only a SHA-256 of each session token.
  - Changing or resetting a password signs out that person's other devices.
- **Cross-site form posts** are refused unless they come from this site's own host or `PUBLIC_URL`.
- **First-run setup code:** printed in the container logs, it stops a stranger from claiming a fresh install. It changes every restart and stops working once the first account exists.
- **Admin-only:** managing people, and later the AI settings.

## Getting to it from outside the house

| Option | Good | Bad |
|---|---|---|
| **Cloudflare Tunnel (recommended)** | No open ports on the router, free HTTPS, and your home IP stays hidden. Works from any phone without extra apps. | Needs a domain on Cloudflare |
| Tailscale | Private, with nothing on the public internet | Every device needs the Tailscale app |
| Reverse proxy + port forward (Caddy, Nginx Proxy Manager) | No third party involved | Opens a port on the router and exposes your home IP |

The tunnel is already in `compose.yaml`. The README explains how to turn it on.

**Optional extra layer:** Cloudflare Access in front of the site. If we use it, add a bypass rule for `/api/store/*`, because the Walmart extension can't get through the Access login.

## Backups and restore

- **Nightly dump.** `db-backup` writes one dump a day and deletes those older than `BACKUP_KEEP_DAYS` (14 by default). Dumps work across Postgres versions.
- **Snapshots.** Take ZFS snapshots of the dataset holding the Dockge stacks folder. That covers photos, the key file and the database files too.
  - A snapshot of a running Postgres recovers the way it would after a power cut. Use the dumps as the main way back.
- **Restore steps** are in the README.

## Upgrading Postgres

Major versions (18 → 19) can't reuse the old data folder:

1. Take a fresh dump.
2. Stop the stack and move `data/postgres` aside.
3. Change both `postgres:` image tags (`db` and `db-backup`) to the new version.
4. Start the stack, which creates an empty database.
5. Restore the dump.
6. Delete the old folder once everything checks out.
