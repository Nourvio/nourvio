# Deployment

Mise runs on the TrueNAS server as a small compose stack: the app, Postgres, a nightly backup job and a Cloudflare Tunnel.

## Target

- **TrueNAS 24.10 or newer.** That's the version where apps moved to Docker. The stack is installed as a custom app using **Install via YAML**.
- **The app image** is based on Node 24 slim. It serves the web app and the API on port 3000.
- **Postgres 18** uses the official `postgres:18` image. Pin the major version, because moving between major versions takes a dump and restore (see [Updating](#updating)).
- **Three datasets,** for example under `/mnt/<pool>/apps/mise/`:

| Dataset | Mounted at | Holds |
|---|---|---|
| `data` | `/data` in the app | `images/` (recipe photos) and `secret` (signing and encryption key, generated on first start) |
| `postgres` | `/var/lib/postgresql` in the db container | The database files |
| `backups` | `/backups` in the backup container | Nightly database dumps |

> **Postgres 18 changed where it keeps data.** Mount the volume at `/var/lib/postgresql`, not the old `/var/lib/postgresql/data`. Mounting the old path fails on 18.
>
> If Postgres can't write to its dataset, give the dataset to UID 999, the `postgres` user inside the image.

## Building the image

- GitHub Actions builds the app image and pushes it to GitHub Container Registry (`ghcr.io/<github-user>/mise`):
  - **On every push:** typecheck, lint and test.
  - **On a version tag** (`v0.3.0`): build and push both `:0.3.0` and `:latest`.
- TrueNAS is x86, so we only build `linux/amd64`.
- **If the repo is private,** the image is private too, and TrueNAS needs GHCR credentials. Add them under Apps → Configuration → Docker Registries, using a GitHub token with `read:packages`.

## Compose file (TrueNAS custom app)

```yaml
services:
  mise:
    image: ghcr.io/<github-user>/mise:latest
    restart: unless-stopped
    depends_on:
      db:
        condition: service_healthy
    environment:
      TZ: America/Chicago                  # your timezone; plan dates use it
      PUBLIC_URL: https://mise.example.com
      DATABASE_URL: postgres://mise:<db-password>@db:5432/mise
      # Optional: AI keys can also be added later in Settings → AI
      ANTHROPIC_API_KEY: <key>
      OPENAI_API_KEY: <key>
      USDA_API_KEY: <key>
    volumes:
      - /mnt/<pool>/apps/mise/data:/data
    ports:
      - "3000:3000"                        # LAN access; optional once the tunnel works

  db:
    image: postgres:18
    restart: unless-stopped
    environment:
      POSTGRES_USER: mise
      POSTGRES_PASSWORD: <db-password>
      POSTGRES_DB: mise
    volumes:
      - /mnt/<pool>/apps/mise/postgres:/var/lib/postgresql
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U mise -d mise"]
      interval: 10s
      timeout: 5s
      retries: 5
    # No ports: only containers in this stack can reach the database.

  db-backup:
    image: postgres:18                     # same version as db, so pg_dump matches
    restart: unless-stopped
    depends_on:
      db:
        condition: service_healthy
    environment:
      PGHOST: db
      PGUSER: mise
      PGPASSWORD: <db-password>
      PGDATABASE: mise
    volumes:
      - /mnt/<pool>/apps/mise/backups:/backups
    entrypoint:
      - /bin/sh
      - -c
      - >
        while true; do
          pg_dump -Fc -f /backups/mise-$$(date +%F).dump &&
          find /backups -name '*.dump' -mtime +14 -delete;
          sleep 86400;
        done

  cloudflared:
    image: cloudflare/cloudflared:latest
    restart: unless-stopped
    command: tunnel run
    environment:
      TUNNEL_TOKEN: <token from the Cloudflare dashboard>
```

- In the Cloudflare dashboard, point the tunnel's public hostname (`mise.example.com`) at `http://mise:3000`.
- Or use the Cloudflared app from the TrueNAS catalog and point it at `http://<truenas-ip>:3000`.
- Use a long random database password. It never needs typing, since only the app and the backup job use it.

## Environment variables

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `DATABASE_URL` | Yes | none | Postgres connection string |
| `PUBLIC_URL` | When public | none | The site's address. Used for cookies and links. |
| `ANTHROPIC_API_KEY` | No | none | Claude key. You can also set it in Settings → AI, but this variable takes precedence. |
| `OPENAI_API_KEY` | No | none | OpenAI key. You can also set it in Settings → AI, but this variable takes precedence. |
| `USDA_API_KEY` | For calculated nutrition | none | FoodData Central key from api.data.gov |
| `MISE_SECRET` | No | Generated into `/data/secret` | Signs session cookies and encrypts API keys saved in Settings. Back it up with the database: without it, saved keys can't be decrypted and have to be re-entered. |
| `TZ` | No | `UTC` | Timezone for plan dates and "today" |
| `PORT` | No | `3000` | |
| `DATA_DIR` | No | `/data` | |

Models are chosen in Settings → AI, not with environment variables. AI features stay hidden until at least one provider has a key.

## First run

When no accounts exist, Mise prints a one-time **setup code** in the container logs. Open the site, enter the code, and create the first account, which becomes the admin. After that, add API keys in Settings → AI (unless they're set in the environment) and invite the other household members.

The setup code stops a stranger who finds the URL before you do from claiming the install.

## Getting to it from outside the house

| Option | Good | Bad |
|---|---|---|
| **Cloudflare Tunnel (recommended)** | No open ports on the router, free HTTPS, and your home IP stays hidden. Works from any phone without extra apps. | Needs a domain on Cloudflare |
| Tailscale | Private, with nothing on the public internet | Every device needs the Tailscale app, including any phone that opens Mise |
| Reverse proxy + port forward (Caddy, Nginx Proxy Manager) | No third party involved | Opens a port on the router and exposes your home IP |

**Optional extra layer:** Cloudflare Access in front of the site. If we use it, add a bypass rule for `/api/store/*`, because the Walmart extension can't get through the Access login. Mise's own login still protects everything.

## Security baseline

- **Login everywhere.** Every route except `/api/health` and the login pages requires a signed-in session or an API token.
- **Login protection.** Attempts are rate-limited, and passwords are hashed with scrypt.
- **HTTPS only.** Cookies are `Secure`, `HttpOnly` and `SameSite=Lax`.
- **Admin-only AI settings.** Only admins can see or change AI settings. Saved keys are encrypted and never sent to the browser.
- **The database isn't published.** It's reachable only inside the compose network.
- **Recipe import can't reach the home network.** The server won't fetch private-network addresses (see [integrations.md](integrations.md#recipe-sites)).
- **Uploads are checked.** Only image types are accepted, with a size limit.

## Backups

- **Nightly dump.** The `db-backup` service runs `pg_dump` once a day into the backups dataset and keeps 14 days. Dumps work across Postgres versions, which also makes major upgrades easy.
- **ZFS snapshots.** A TrueNAS periodic snapshot task covers all three datasets, daily and kept for 30 days.
  - It protects images and `/data/secret` along with the database.
  - A snapshot of a running Postgres recovers the way it would after a power cut. Use the dumps as the main way back.
- **Optional off-site copy** using TrueNAS Cloud Sync or replication.
- **Restore:**
  1. Stop the `mise` service.
  2. From the `db-backup` container, run `pg_restore --clean --if-exists -d mise /backups/mise-<date>.dump`.
  3. Start `mise` again.

  Restore images and the secret from a snapshot if needed.

## Updating

1. **The app:**
   1. Tag a release. CI builds and pushes the image.
   2. In TrueNAS, update the app so it pulls the new image.
   3. Mise runs any new database migrations at startup.

   Releases that change the database say so in the changelog. Take a manual dump first:

   ```bash
   docker exec <db-backup container> pg_dump -Fc -f /backups/mise-pre-upgrade.dump
   ```
2. **Postgres major versions** (for example 18 → 19):
   1. Take a dump.
   2. Point a new, empty `postgres` dataset at the new image version.
   3. Restore the dump.
   4. Switch the app over. Keep the old dataset until the new one checks out.
   5. Change the `db-backup` image to the same version.

   Never point a newer Postgres at an older data directory.
