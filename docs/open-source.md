# Open source

What it takes to run Merran as a public project: the name and license, how people contribute, keeping the code and its dependencies healthy, docs, and launch.

## Name, license and brand

- **Name:** Merran. A check on October 15, 2026 found no MERRAN trademark in the US or EU registers and no product by that name; the closest is a pending US application for MERRIN (software, an AI parenting app), worth a real trademark check before filing a mark of our own.
- **Where it lives:** the GitHub organization `merran-app` (`merran` is a dormant personal account), the repo `merran-app/merran`, images at `ghcr.io/merran-app/merran`, the site at `merran.app`, and the `@merran` npm scope (free, still to claim).
- **License:** AGPL-3.0-or-later, as the REFERENCE app chose. Anyone can run, change and share it; anyone running a changed copy for others over a network must offer its source. The browser extension and the telemetry receiver use the same license.
- **Docs:** CC BY 4.0, so others can reuse them with credit.
- **The name and logo aren't covered by the AGPL.** A short `TRADEMARK.md` says forks are welcome but shouldn't be published as "Merran" in a way that confuses people.

## Contributions

- **A DCO, not a CLA** (decided October 15, 2026): each commit is signed off ("I have the right to contribute this", `git commit -s`), checked by a DCO bot. A CLA would only matter for relicensing, and there's no paid hosted version or proprietary edition planned. The AGPL still lets anyone, the maintainer included, run Merran for others.
- **Files in the repo:**

| File | What it covers |
|---|---|
| `README.md` | What Merran is, screenshots, a two-minute install, links to the docs |
| `CONTRIBUTING.md` | Setting up, the commands, how to send a change, commit messages, the DCO |
| `CODE_OF_CONDUCT.md` | Contributor Covenant |
| `SECURITY.md` | How to report a vulnerability privately, and what happens next |
| `SUPPORT.md` | Where to ask questions (Discussions), and what issues are for |
| `GOVERNANCE.md` | Who decides: the maintainer for now, and how that could change |
| `PRIVACY.md` | What Merran sends where (from [operations.md](operations.md#what-leaves-the-server)) |
| `TRADEMARK.md` | Using the name and logo |
| `CHANGELOG.md` | Written by release-please |
| `.github/` | Issue forms (bug with diagnostics, store request, importer request), a pull request template, `CODEOWNERS`, `FUNDING.yml`, Renovate and workflow files |

- **Issues are for bugs; ideas go to Discussions,** with a template that asks what problem it solves. Popular ideas move to the public roadmap.
- **A public roadmap** on a GitHub Project board, and labels by area (`area:recipes`, `module:stores`) and for newcomers (`good first issue`, `help wanted`).
- **AI-written contributions** (decided October 15, 2026): Merran itself is built with Claude, so they're welcome, but the contributor must understand and stand behind every line, and the pull request template asks which parts an AI wrote.

## A good first hour for contributors

- **One command to start:** `pnpm install`, then `pnpm dev`, which starts Postgres in Docker and the app with a sample household (recipes, a week planned, a list) already signed in.
- **No keys needed:** a fake AI provider gives canned but realistic answers, so the assistant, import and tidy-up can be worked on for free. Real keys are optional.
- **A dev container** for VS Code and Codespaces, for people who'd rather not install Node and Postgres.
- **Guides for the common additions:** a store, an importer, an AI provider, a language. Each is an adapter with a test template.
- **`/styleguide`** stays, showing every component in every palette.

## Keeping the code healthy

CI runs on every pull request:

| Check | Why |
|---|---|
| Typecheck, lint, format | The basics |
| knip | No unused files, exports or dependencies |
| Unit and route tests (PGlite) | Fast, on every push |
| The same tests on real Postgres 18 | Catches what PGlite doesn't |
| Household isolation test, generated from the schema | No household-owned table without one (see [platform.md](platform.md#keeping-households-apart)) |
| Migration check | The schema and the committed migrations agree, and migrations apply to a copy of the last release's database |
| OpenAPI diff | No unannounced breaking change to the public API |
| Translation check | No user-facing string missing from the English file |
| Contrast check | Every palette still passes WCAG (carried over) |
| Playwright | A few real flows against the built image: set up, import a recipe, plan a week, make the list, cook |
| Image build | The Docker image builds and starts healthy |
| Bundle size | The web app doesn't quietly double |

## Keeping dependencies healthy

- **Renovate:** weekly grouped updates, security updates at once, and auth packages (`better-auth`, `@better-auth/*`) always updated together.
- **GitHub's dependency review** flags risky new packages in pull requests; **CodeQL** scans the code.
- **Secret scanning with push protection** is on, and `mrn_` keys are registered as a custom pattern.
- **Workflows pin actions by commit hash.**
- **OpenSSF Scorecard** runs weekly and its badge goes in the README.
- The yt-dlp and ffmpeg downloads in the Dockerfile stay checksum-checked, as in the REFERENCE app.

## Security reports

- GitHub's private vulnerability reporting is on, and `SECURITY.md` explains it.
- A reply within a few days, a fix and release as soon as practical, and a published advisory crediting the reporter.
- The docs keep a short **threat model**: what Merran protects (households from each other, keys, the home network from imports) and what it doesn't (a server admin with shell access can read everything).

## Docs

- **A docs site** at `merran.app`, built with Starlight, that is also the landing page (the REFERENCE roadmap's "site that shows it off"):
  - **Home:** what it does, screenshots, a short video, and the demo
  - **Install:** Docker Compose, Unraid, behind each kind of proxy, updating, backups
  - **Configure:** every setting, generated from the config schema
  - **Use:** a guide per area (recipes, planning, the list, the pantry, the assistant, stores)
  - **AI:** getting keys, costs, the server and household key rules, which local models work
  - **API:** the reference, generated from the OpenAPI spec, plus examples (Home Assistant, a shell script)
  - **Contribute:** architecture, conventions, adding a store, importer, provider or language
- **Docs change with the code:** a pull request that changes behavior updates the docs in the same pull request, and the configuration and API pages can't drift because they're generated.
- The repo's `docs/` keeps the decision records (like this plan), and the site is for people using and running Merran.

## Funding

- GitHub Sponsors (and Open Collective, if others join as maintainers) to cover the domain, the demo and the telemetry receiver.
- No paid features, no paid hosted version and no proprietary edition.

## Launch

1. **While building:** only `edge` images, no releases and no announcement. The maintainer's own household uses Merran day to day as soon as phase 3 works, starting fresh.
2. **0.1, the first release:** everything the REFERENCE app does plus the new work in [scope.md](scope.md), with the docs site and the demo. Announced in r/selfhosted and the selfh.st newsletter.
3. **0.x releases** fix what early users find and add what they ask for.
4. **1.0:** the API and export format are promised stable, translations open on Weblate, and Merran goes on the awesome-selfhosted list (which wants a project's first release to be at least four months old).
