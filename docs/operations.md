# Operations

Running Merran: logs, error tracking, analytics, what leaves the server, how it's installed and updated, and backups. The rule throughout: **nothing leaves the server unless the person running it turned it on**, and every switch is documented.

## Logs

- **pino:** JSON lines in production (for Loki, Dozzle or `docker logs`), readable colored lines in development.
- `MERRAN_LOG_LEVEL`: `info` by default; `debug` for troubleshooting.
- **Each request gets an id,** in the log lines it causes and the `X-Request-Id` response header, so a person's error message can be matched to the logs.
- **Redacted automatically:** cookies, `Authorization` headers, API keys, AI keys, passwords and tokens. Recipe text, chat messages and pantry contents are never logged at `info`.

## Health

- `GET /api/health`: is the process up (Docker's health check).
- `GET /api/health/ready`: can it reach the database, have migrations run, are jobs being worked. For uptime monitors like Uptime Kuma.
- Both return no personal data and need no sign-in.

## Error tracking

Two different needs, handled separately.

**1. The operator's own error tracking** (off by default)
- Set `MERRAN_SENTRY_DSN` and both the server and the web app report errors there. It works with Sentry, and with the self-hosted, Sentry-compatible **GlitchTip** and **Bugsink**, so errors can stay on the operator's own hardware.
- The browser gets its DSN from the server at start, so the image doesn't need rebuilding.
- **Scrubbed before sending:** cookies, headers, keys, request and response bodies, and anything that looks like a key. People are identified only by a random id, never a name or email.
- Settings: environment name, sample rates, and whether to include performance traces.

**2. A built-in Problems page** (always on, nothing sent anywhere)
- The server keeps the last few hundred errors in the database (message, where, when, request id, how often), with no personal data.
- Settings → This server → **Problems** lists them, grouped, so a server admin without Sentry can still see what's going wrong.
- **Copy diagnostics** puts together what a bug report needs: version, install method, modules on, Postgres version, the recent problems. Personal data is left out, and it's shown before copying.
- **Report a problem** opens a new GitHub issue with the diagnostics filled in. Nothing is sent unless the person submits that issue themselves.

**Not in 0.1: crash reports sent to the Merran project.** Running a collector, and the privacy promises that come with it, isn't worth it while the Problems page and prefilled issues cover bug reports.

## Metrics

- `MERRAN_METRICS=true` turns on `/metrics` in Prometheus format: requests, response times, jobs (waiting, running, failed), AI calls and spend by provider, imports.
- Protected by a token (`MERRAN_METRICS_TOKEN`) or reachable only from addresses the operator lists.
- **Later:** OpenTelemetry traces, through the standard `OTEL_*` variables.

## Analytics

"Analytics" means three different things here, and they're kept apart.

### 1. Usage on your own server (for the server admin)

Built in, worked out from the database, never sent anywhere. Settings → This server → **Usage**:
- households, people, and who's been active in the past week and month
- recipes, imports, meals planned and cooked
- AI spend by household, task, model and whose key paid
- jobs run and failed

### 2. Telemetry for the Merran project (opt-in)

Knowing roughly how many servers run Merran, on which versions, and which modules people use helps decide what to build and when an old version can stop being supported. It must be something a self-hoster can trust.

- **Off unless the server admin says yes.** The setup screen asks once ("Help improve Merran by sending an anonymous summary once a day?"), with a link to exactly what's sent. Settings → This server → Telemetry can change it any time.
- `MERRAN_TELEMETRY=off` turns it off for good and hides the question, for people deploying many copies.
- **See what's sent.** Settings shows the exact JSON of the next report.
- **What's sent, once a day:**
  - a random install id (not derived from anything; **Reset** makes a new one)
  - Merran version, install method (Docker image, source), CPU architecture, Postgres major version
  - which modules are on (yes or no each)
  - which kinds of AI provider are set up (Anthropic, OpenAI, OpenAI-compatible, none), not models or keys
  - counts in ranges: households (1, 2–5, 6–20, more), people, recipes (under 100, 100–500...)
  - the server's language and country settings
- **Never sent:** names, usernames, emails, recipes, addresses, keys, IP addresses (the receiver doesn't store them), anything a person typed.
- **Where it goes:** a small receiver the project runs (`telemetry.merran.app`), with its code in this repo (`apps/telemetry`), so anyone can read what's kept. A public page shows the totals (like Home Assistant's analytics page): installs by version, modules in use.
- **Nothing in the web app tracks clicks or pages.** No PostHog, no Google Analytics inside Merran, not even opt-in. That's the line between "an anonymous daily count" and tracking people in their own kitchen.

### 3. The project's own websites

The docs site and the demo can use privacy-friendly page counts (Plausible, Umami or Cloudflare Web Analytics, no cookies). This never touches anyone's Merran.

## What leaves the server

Every outside call Merran can make, when, and how to stop it. This table also goes in `PRIVACY.md`.

| Where | When | What's sent | Off by |
|---|---|---|---|
| The household's or server's AI provider | AI features | The recipe, page, photo or chat at hand, and the household's tastes and pantry when the task needs them | No AI key |
| Recipe sites and feeds | Importing a link, following a site, Discover results | A normal page request, with Merran's user agent | Not importing; Recipe sites module off |
| TikTok, YouTube, Instagram, Facebook | Importing a video | Requests made by yt-dlp | Video import module off |
| GitHub releases | yt-dlp updating itself, weekly | A download request | `MERRAN_YTDLP_AUTO_UPDATE=false` |
| GitHub releases | The update check, every 6 hours | A request for the latest release | `MERRAN_UPDATE_CHECK=false` |
| USDA | Working out nutrition | Food names | No USDA key |
| Kroger | Prices, product search, sending a cart | Food names, product ids, the linked account's token | No Kroger app |
| Browsers' push services | Sending a notification | An encrypted message only the phone can read | Notifications off |
| Addresses a household chose | Webhooks | Event ids and a short summary, signed | No webhooks; private addresses refused unless the server admin allows |
| SMTP server | Invites, resets | The email | No SMTP |
| SSO provider | Signing in | The usual OIDC exchange | No SSO |
| Sentry or compatible | Errors | Scrubbed error reports | No DSN |
| `telemetry.merran.app` | Daily | The summary above | Off unless opted in |

`MERRAN_OUTBOUND=minimal` turns off everything Merran does on its own (update checks, yt-dlp updates, feed reads, telemetry) and leaves only what someone asks for at the time (importing a link, an AI call).

## Getting Merran

### Images

- **Prebuilt images on GitHub's registry:** `ghcr.io/merran-app/merran`, for `amd64` and `arm64` (so a Raspberry Pi 4 or 5 works).
- **Tags:** `1.4.2`, `1.4`, `1`, `latest` (the newest release) and `edge` (every commit to main, for testers).
- **Signed and described:** each image is signed with cosign and carries an SBOM and build provenance, so anyone can check it came from this repo's CI.
- **One image with everything,** yt-dlp and ffmpeg included (about 100 MB of the image). Modules that aren't wanted are turned off rather than built out.
- **Running as a normal user:** the container drops to `PUID`/`PGID` as in the REFERENCE app, or runs as any user set in compose.

### The compose file

- `merran` (the image), `db` (`postgres:18`) and `db-backup` (nightly dumps), plus optional services behind profiles: `voice` (Kokoro) and `tunnel` (cloudflared).
- **One value to fill in:** `POSTGRES_PASSWORD`. Everything else has a default or is set in the app.
- `docker compose --profile voice up -d` adds Kokoro; no editing the file.

### Where people run it

| Where | How | When |
|---|---|---|
| Docker Compose (any Linux box, Dockge, Portainer) | The compose file | 0.1 |
| Unraid | A Community Applications template | 0.1 |
| TrueNAS SCALE | The community app catalog | After 0.1 |
| Proxmox | The community helper scripts | After 0.1 |
| Kubernetes | A Helm chart | When someone asks |
| CasaOS, Umbrel, YunoHost | Their app stores | When someone asks |

**What it needs:** about 1 GB of RAM for Merran and Postgres together; Kokoro adds 1 to 2 GB. Two CPU cores are plenty.

### Reaching it from outside

Docs for each common way in: a Cloudflare Tunnel (in the compose file), Tailscale, Caddy, Traefik and Nginx Proxy Manager. Each covers `MERRAN_PUBLIC_URL`, `MERRAN_TRUSTED_PROXIES`, and why sign-up should stay off on a public address.

## Releases and updates

- **Semantic versions.** `0.x` while the API and export format may still change; `1.0` once they're promised stable.
- **release-please** reads conventional commit messages, keeps `CHANGELOG.md` and opens a release pull request. Merging it tags the release, builds and signs the images, attaches the browser extension's zips, and writes the GitHub release notes.
- **Database changes run at startup.** Before applying any, Merran takes a dump into `data/backups` (`pre-1.5.0-<date>.dump`), so a bad update can always be undone.
- **Downgrades aren't supported,** and the release notes say when an update can't be undone without that dump.
- **The update check** asks GitHub for the latest release (not commits, as the REFERENCE app did), every 6 hours. The server admin sees an Update badge and the release notes, with the commands for their install method. `MERRAN_UPDATE_CHECK=false` turns it off.
- **Support:** the latest minor version gets fixes. Security fixes go to the latest minor of the current major.

## Backups and restore

- **Nightly database dumps** by `db-backup`, kept for `BACKUP_KEEP_DAYS` (14 by default), as in the REFERENCE app.
- **Files** (photos, the secret key) are in `data/`, next to the compose file. The docs say plainly: back up the whole `data` folder, and keep `data/app/secret` (or `MERRAN_SECRET`) with it, or saved keys must be entered again.
- **Download a backup** (server admin, Settings → This server): the database and files in one archive.
- **Restoring** is documented step by step, and CI restores a dump into a fresh install on every release to prove the steps work.
- **A household export** (see [platform.md](platform.md#export-and-import)) is the way to move one household, not a backup of the server.

## A public demo

- `demo.merran.app`: a household full of sample recipes, a planned week and a list, reset every night.
- Sign-up off; everyone shares a demo account, or gets a throwaway household that's deleted after a day.
- AI on a small model with a strict daily limit, or off with a note saying what it would do.
- Store connections and email off.
