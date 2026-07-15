# Budget — Family Budgeting & Wealth Tracker

**Replace your household budgeting spreadsheet with a multi-user, multi-currency app that tells your family exactly what to do this week to stay on plan.**

Budget is a self-hosted, installable web app for households that outgrew their Excel budget. Plan and track spending, keep a **Reserve** buffer for irregular costs, run a **Cushion** austerity mode when money is tight, watch your investments across stocks, crypto, gold, and property — and let a single **Tasks queue** turn all of it into a short, concrete to-do list.

It is a deterministic household ledger and planner: the math is trustworthy, history is queryable, and nothing is a black box.

[![CI](https://github.com/madonzy13-claude/budget/actions/workflows/ci.yml/badge.svg)](https://github.com/madonzy13-claude/budget/actions/workflows/ci.yml)
[![Release](https://github.com/madonzy13-claude/budget/actions/workflows/release.yml/badge.svg)](https://github.com/madonzy13-claude/budget/actions/workflows/release.yml)

---

## Features

### 📋 Tasks queue — the front page

The home screen isn't a wall of charts, it's an inbox of concrete actions: _"Move €420 from Reserve to your spending account," "Top up the Cushion by €150," "Review this month's spending."_ One glance tells the whole family what to do this week to keep the budget, reserve, and cushion healthy.

### 💸 Plan & track spending

Set per-category limits with a dual **normal / cushion** budget. Capture expenses in three taps by voice or a quick form, from any screen. Every transaction keeps its foreign-currency original one tap away while your dashboards run in your home currency.

### 🪙 Reserve & Cushion

Two first-class savings concepts, not buried settings:

- **Reserve** — a per-category buffer for irregular costs (insurance, car service, holidays). The app tracks what's set aside vs. used and suggests moves.
- **Cushion** — an austerity target you fall back to when income drops, with suggested top-ups and redeployments.

### 📈 Investments & net worth

Track holdings across **stocks, ETFs, crypto, precious metals, bonds, real estate, cash, and bank deposits** in one portfolio. Live prices for supported instruments, manual valuation for the rest, cost-basis-aware profit/loss, and a wealth timeline that shows how your net worth moves over time.

### 🌍 Multi-currency, done right

Hold accounts, spend, and invest across currencies. Default-currency totals drive every dashboard; the original amount and the as-of-date FX rate are always available on the row. Correct month boundaries and time zones per user.

### 👨‍👩‍👧 Households, roles & privacy

Invite family members to a shared budget with **owner / member** roles. Per-member contribution shares split costs fairly. A personal budget stays private — members see the family budget, never the lead's private one — and a one-tap **privacy toggle** redacts every amount on screen when someone's looking over your shoulder.

### 📊 Insights & history

Spending-growth curves, overspent-category timelines, reserve/cushion adequacy, and a cash-flow projection that heat-maps the days ahead. An append-only ledger and audit history answer _"what changed, and when?"_ on every editable row.

### 📱 Installable PWA + notifications

Mobile-first, installable to your home screen, and usable offline for reading. Opt-in **web push** and an app-icon badge nudge you when a task needs attention.

### 🔔 Built for real life

- **Languages:** English, Polish, Ukrainian.
- **Onboarding:** a conversational wizard seeds your categories and budget so a new family starts in minutes.
- **Your data is yours:** GDPR/CCPA data export and right-to-delete, opt-in analytics, and no per-seat pricing — you host it.

---

## Deploy with Docker Compose

Every release publishes prebuilt images to the GitHub Container Registry:

| Image                                      |                                          |
| ------------------------------------------ | ---------------------------------------- |
| `ghcr.io/madonzy13-claude/budget-web`      | Next.js web app (PWA)                    |
| `ghcr.io/madonzy13-claude/budget-api`      | Hono API                                 |
| `ghcr.io/madonzy13-claude/budget-worker`   | Background jobs (reminders, price scans) |
| `ghcr.io/madonzy13-claude/budget-migrator` | One-shot database migrator               |

### Prerequisites

- A host with **Docker** and **Docker Compose v2**.
- A domain name and a TLS-terminating reverse proxy (Caddy, nginx, Traefik) or a Cloudflare Tunnel in front of the web container — a service worker, Web Push, and PWA install all require HTTPS.

### Install

```bash
# 1. Clone the repo (for the compose file + Postgres bootstrap scripts)
git clone https://github.com/madonzy13-claude/budget.git
cd budget

# 2. Create your production env file (git-ignored) and fill in real secrets
cp .env.prod.example .env.prod
chmod 600 .env.prod
#   Generate secrets:
#     openssl rand -base64 24   # each Postgres role password
#     openssl rand -base64 48   # BETTER_AUTH_SECRET
#     openssl rand -base64 32   # BUDGET_KEK
#   Set APP_URL / BETTER_AUTH_URL / TRUSTED_ORIGINS to your public https origin.

# 3. Pull the release images and start the stack
docker compose --env-file .env.prod -f docker-compose.prod.yml pull
docker compose --env-file .env.prod -f docker-compose.prod.yml up -d
```

The migrator runs first and sets up the database (schema, roles, row-level security); the API and worker wait for it, then the web app comes up on **port 3000**. Point your reverse proxy at `http://<host>:3000`.

### Pin a version

By default the stack tracks `:latest`. To pin an exact release, set it in `.env.prod`:

```bash
BUDGET_VERSION=v0.1.0
```

### Upgrade

```bash
# bump BUDGET_VERSION in .env.prod (or stay on :latest), then:
docker compose --env-file .env.prod -f docker-compose.prod.yml pull
docker compose --env-file .env.prod -f docker-compose.prod.yml up -d
```

Your data lives in the `budget-db-data` volume and survives upgrades and `down`.

### Web Push (optional)

Push notifications need a VAPID keypair. Generate one with `npx web-push generate-vapid-keys`, put the **private** key in `.env.prod` (`VAPID_PRIVATE_KEY` / `VAPID_SUBJECT`), and make sure the **public** key baked into the web image matches it (repo variable `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, consumed by the release build). Leave them blank to run without push — everything else works.

---

## Releases

Images are published automatically, and only from a **green** build:

1. Cut a release by pushing a SemVer tag from a commit that has passed CI on `main`:
   ```bash
   git tag v0.1.0
   git push origin v0.1.0
   ```
2. The **Release** workflow validates the tag, **verifies CI was fully green on that commit** (it refuses to publish otherwise), then builds and pushes all four images to GHCR — tagged `:0.1.0`, `:0.1`, `:latest`, and the commit SHA — scans them (Trivy), attaches SBOMs, and drafts a GitHub Release.

The git tag is the source of truth for the published version.

---

## Development

Contributor setup, the full technology stack, and architecture conventions live in [`CLAUDE.md`](./CLAUDE.md). In short:

```bash
bun install
make dev        # full stack (db + migrator + api + web + worker) via Docker
make test       # backend unit + integration tests
```

The dev stack uses `docker-compose.yml` (builds from source) and `.env` for non-secret config. See `CLAUDE.md` for the local development workflow.
