# CI/CD Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a fully green CI pipeline on PRs, automatic Docker image release on git tags, Dependabot patch+minor auto-merge, and a clean prod/dev compose split — implementing the design in `docs/superpowers/specs/2026-05-08-cicd-design.md`.

**Architecture:** Three GitHub Actions workflows (`ci.yml`, `release.yml`, `auto-merge.yml`) + `dependabot.yml`. Pre-existing red bars (lint, typecheck, vitest, e2e flake) are fixed first so the new pipeline lands green. Production `docker-compose.yml` is reduced to runtime-only services; dev-only services move to `docker-compose.override.yml` (auto-loaded for local dev, excluded from CI smoke tests).

**Tech Stack:** GitHub Actions, Bun 1.3.x, Docker Buildx, DockerHub, Trivy, CodeQL, Gitleaks, Dependabot, hadolint, Playwright BDD.

**Reference spec:** `docs/superpowers/specs/2026-05-08-cicd-design.md`

**Identifiers:**

- DockerHub namespace: `madonzy13claude`
- GitHub repo (to be created): `madonzy13claude/budget` (private)
- Default branch: `main` (rename from local `master`)

---

## Phase A — Turn pre-existing red bars green

These exist on `master` today. CI must be green on `master` _before_ the new CI files land, otherwise the first CI run will fail and undermine confidence. Each fix is one commit, atomic.

### Task A1: Fix ESLint ignore pattern for nested `.next/`

**Files:**

- Modify: `eslint.config.js:9`

**Why:** `.next/**` from a flat-config root only matches `./next/**`, not `apps/web/.next/**`. 62 of 63 ESLint errors come from generated files in `apps/web/.next/types/`. `playwright-bdd` also generates `.features-gen/` which should be ignored.

- [ ] **Step 1: Replace the ignore line**

Current line 9:

```js
  { ignores: ['node_modules/**', 'dist/**', '.next/**', 'coverage/**', 'playwright-report/**'] },
```

Replace with:

```js
  { ignores: ['**/node_modules/**', '**/dist/**', '**/.next/**', '**/coverage/**', '**/playwright-report/**', '**/.features-gen/**'] },
```

- [ ] **Step 2: Verify generated files are ignored**

Run: `bunx eslint apps packages --ext .ts,.tsx --max-warnings 0 -f json | node -e 'const d=JSON.parse(require("fs").readFileSync(0,"utf8"));const next=d.filter(f=>f.filePath.includes("/.next/")&&(f.errorCount||f.warningCount));console.log("nested .next issues:",next.length);'`

Expected: `nested .next issues: 0`

- [ ] **Step 3: Commit**

```bash
git add eslint.config.js
git commit -m "fix(lint): glob nested .next and add .features-gen to eslint ignores"
```

---

### Task A2: Remove unused `tenantGuard` import in workspaces test

**Files:**

- Modify: `apps/api/test/routes/workspaces.test.ts:39`

**Why:** `tenantGuard` is imported but never referenced — ESLint reports `@typescript-eslint/no-unused-vars`.

- [ ] **Step 1: Delete the import**

Find line 39:

```ts
const { tenantGuard } = await import("../../src/middleware/tenant-guard");
```

Delete it entirely (one line removal).

- [ ] **Step 2: Verify lint clean for that file**

Run: `bunx eslint apps/api/test/routes/workspaces.test.ts --max-warnings 0`

Expected: no output, exit 0.

- [ ] **Step 3: Verify the test file still runs**

Run: `cd apps/api && bun test test/routes/workspaces.test.ts`

Expected: tests pass (the import was unused, so removal cannot break behavior).

- [ ] **Step 4: Commit**

```bash
git add apps/api/test/routes/workspaces.test.ts
git commit -m "fix(api/test): drop unused tenantGuard import from workspaces test"
```

---

### Task A3: Remove three stale `eslint-disable` directives

**Files:**

- Modify: `apps/api/src/routes/auth.ts:11`
- Modify: `apps/api/src/routes/settings.ts:88`
- Modify: `apps/api/src/routes/settings.ts:106`

**Why:** ESLint reports `Unused eslint-disable directive (no problems were reported from '@typescript-eslint/no-explicit-any')`. The underlying `as any` is still there but the rule no longer fires (tightened TypeScript inference made it unnecessary).

- [ ] **Step 1: Remove the directive in `auth.ts`**

In `apps/api/src/routes/auth.ts`, delete line 11 (`// eslint-disable-next-line @typescript-eslint/no-explicit-any`). The next line (`r.all(...)`) remains unchanged.

After change, lines 9–13 read:

```ts
export function authRoutes(deps: BootedDeps) {
  const r = new Hono();
  r.all("/*", async (c) => (deps.identity.auth as any).handler(c.req.raw));
  return r;
}
```

- [ ] **Step 2: Remove the directive at `settings.ts:88`**

Delete line 88 (`// eslint-disable-next-line @typescript-eslint/no-explicit-any`). Line 89 (`const auth = deps.identity.auth as any;`) remains.

- [ ] **Step 3: Remove the directive at `settings.ts:106`**

Delete line 106 (same comment string). Line 107 (`const auth = deps.identity.auth as any;`) remains.

- [ ] **Step 4: Verify lint clean for both files**

Run: `bunx eslint apps/api/src/routes/auth.ts apps/api/src/routes/settings.ts --max-warnings 0`

Expected: no output, exit 0.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/auth.ts apps/api/src/routes/settings.ts
git commit -m "fix(api/lint): drop stale eslint-disable directives that no longer apply"
```

---

### Task A4: Fix `display_currency` → `displayCurrency` in identity sign-up

**Files:**

- Modify: `packages/identity/src/application/sign-up.ts:24`

**Why:** Better Auth `additionalFields` were configured with camelCase property `displayCurrency` (matches the DB column via Better Auth's field mapping). The application service still writes the snake_case key, which fails the typed signature of `auth.api.signUpEmail`.

- [ ] **Step 1: Replace the snake_case key**

In `packages/identity/src/application/sign-up.ts`, change line 24 from:

```ts
        display_currency: input.displayCurrency,
```

to:

```ts
        displayCurrency: input.displayCurrency,
```

- [ ] **Step 2: Verify the package typechecks**

Run: `bun run --filter='@budget/identity' typecheck`

Expected: `@budget/identity typecheck: Exited with code 0`.

- [ ] **Step 3: Run the package's unit tests**

Run: `bun --filter='@budget/identity' test 2>&1 | tail -10`

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add packages/identity/src/application/sign-up.ts
git commit -m "fix(identity): use camelCase displayCurrency to match Better Auth field"
```

---

### Task A5: Fix SMTP user/pass `exactOptionalPropertyTypes` typecheck error

**Files:**

- Modify: `apps/api/src/boot.ts:39-45`

**Why:** `tsconfig.base.json` enables `exactOptionalPropertyTypes: true`. `SmtpEmailSenderConfig` declares `user?: string` (no `| undefined`), which under strict-exact-optional means "may be omitted, but if present must be a string — not undefined". `env.SMTP_USER` resolves to `string | undefined`, so passing it directly fails the contract.

The clean fix: spread the optional fields conditionally so they are only present when defined.

- [ ] **Step 1: Replace the constructor call**

In `apps/api/src/boot.ts`, find lines 39–45:

```ts
return new SmtpEmailSender({
  host: env.SMTP_HOST,
  port: env.SMTP_PORT,
  from: env.SMTP_FROM,
  user: env.SMTP_USER,
  pass: env.SMTP_PASS,
});
```

Replace with:

```ts
return new SmtpEmailSender({
  host: env.SMTP_HOST,
  port: env.SMTP_PORT,
  from: env.SMTP_FROM,
  ...(env.SMTP_USER !== undefined ? { user: env.SMTP_USER } : {}),
  ...(env.SMTP_PASS !== undefined ? { pass: env.SMTP_PASS } : {}),
});
```

- [ ] **Step 2: Verify the package typechecks**

Run: `bun run --filter='@budget/api' typecheck`

Expected: `@budget/api typecheck: Exited with code 0`.

- [ ] **Step 3: Verify `make dev` still authenticates with mailpit**

Run: `infisical run --env=dev -- docker compose up -d --wait`. Then check mailpit gets connections by signing up via the running web container or checking logs.

Run: `docker compose logs api 2>&1 | grep -i smtp | head -3`

Expected: log line `email transport: SMTP` with host `mailpit`.

(If mailpit env vars are not set in dev .env, this is fine — the mailpit dev override in Phase B will provide them. For now, just confirm the API container starts without crashing.)

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/boot.ts
git commit -m "fix(api/boot): conditionally spread SMTP user/pass to satisfy exactOptionalPropertyTypes"
```

---

### Task A6: Add Vitest router mock for `LocaleSelect` test

**Files:**

- Modify: `apps/web/test/locale-switcher.test.tsx` (add a `vi.mock` block at top)

**Why:** `LocaleSelect` calls `useRouter()` and `usePathname()` from `next/navigation`. Vitest with `happy-dom` does not mount the App Router, so `useRouter` throws `invariant expected app router to be mounted`. The test does not assert routing behaviour, only that the select renders — so a stub mock is sufficient.

- [ ] **Step 1: Add the mock at the top of the file**

In `apps/web/test/locale-switcher.test.tsx`, after the existing imports (line 3) and before the existing `vi.mock("next-intl", ...)` block (line 5), add:

```ts
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/en/settings",
}));
```

The final file head reads:

```ts
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { LocaleSelect } from "../src/components/settings/locale-select";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/en/settings",
}));

// Mock next-intl
vi.mock("next-intl", () => ({
  …
```

- [ ] **Step 2: Run the failing test**

Run: `cd apps/web && bunx vitest run test/locale-switcher.test.tsx`

Expected: `Tests  2 passed (2)`.

- [ ] **Step 3: Run the full vitest suite**

Run: `cd apps/web && bunx vitest run`

Expected: `Test Files  4 passed (4)`, `Tests  17 passed (17)`.

- [ ] **Step 4: Commit**

```bash
git add apps/web/test/locale-switcher.test.tsx
git commit -m "fix(web/test): mock next/navigation in locale-switcher test"
```

---

### Task A7: Stabilize the `auth-guards` E2E flake with a CI retry budget

**Files:**

- Modify: `playwright.config.ts`

**Why:** `tests/e2e/features/auth/auth-guards.feature` "Authenticated user on /sign-in is redirected to /workspaces" passes in isolation (`bunx playwright test --grep="Authenticated user on /sign-in"` → 1 passed in 8.5s) but flakes during the full suite — likely a session-cookie propagation race between the `freshUser` fixture's verification redirect and the next `page.goto()`. Adding a single retry in CI absorbs the flake without masking real failures, while local runs stay strict.

- [ ] **Step 1: Add `retries` to the Playwright config**

In `playwright.config.ts`, the current `defineConfig({...})` has no `retries` field. Modify it to:

```ts
import { defineConfig } from "@playwright/test";
import { defineBddConfig } from "playwright-bdd";

const testDir = defineBddConfig({
  features: "tests/e2e/features/**/*.feature",
  steps: ["tests/e2e/steps/**/*.ts", "tests/e2e/fixtures/**/*.ts"],
});

export default defineConfig({
  testDir,
  timeout: 30000,
  retries: process.env["CI"] ? 1 : 0,
  use: {
    baseURL: process.env["PLAYWRIGHT_BASE_URL"] ?? "http://localhost:3000",
    trace: "on-first-retry",
  },
  reporter: [["html", { outputFolder: "playwright-report" }]],
});
```

- [ ] **Step 2: Verify config loads cleanly**

Run: `bunx playwright test --list 2>&1 | tail -3`

Expected: list of tests, no config errors.

- [ ] **Step 3: Run the full E2E suite to confirm green or single retry**

Run: `infisical run --env=dev -- make test-e2e 2>&1 | tail -5`

Expected: `45 passed` (one of which may be marked `flaky` if it took the retry).

If still red after retry, escalate: open a bug ticket and continue with the rest of the plan. Do NOT add more retries — that hides real bugs.

- [ ] **Step 4: Commit**

```bash
git add playwright.config.ts
git commit -m "test(e2e): allow 1 retry in CI to absorb session-propagation flakes"
```

---

### Task A8: Confirm full CI gate green locally (sanity checkpoint)

No file changes. This is a **stop-and-verify** task that ensures the existing red bars are all green before adding new pipeline files.

- [ ] **Step 1: Run all current CI checks locally**

Run sequentially:

```bash
bun install --frozen-lockfile
bunx eslint apps packages --ext .ts,.tsx --max-warnings 0
bun run typecheck
bunx depcruise --config .dependency-cruiser.cjs --output-type err apps packages
bun run grep:no-direct-tx
bun run grep:no-pool-connect
cd apps/web && bunx vitest run && cd ../..
infisical run --env=dev -- bun run test:ci-gate
infisical run --env=dev -- docker compose up -d --wait
infisical run --env=dev -- make test-e2e
```

Expected: every command exits 0 (or, in the case of e2e, completes with `45 passed` possibly with one `flaky`).

- [ ] **Step 2: If any step fails, stop and address before proceeding to Phase B**

Do not skip this checkpoint. The whole point of Phase A is that the new CI lands on a green base.

---

## Phase B — Split prod compose from dev-only services

### Task B1: Strip mailpit + dev-only env defaults from `docker-compose.yml`

**Files:**

- Modify: `docker-compose.yml`

**Why:** `docker-compose.yml` must define only services that run in production (db, migrator, api, web, worker). Mailpit and the `:-mailpit` SMTP defaults are dev-only and belong in `docker-compose.override.yml`, which compose auto-merges for local dev.

- [ ] **Step 1: Remove the mailpit service block**

Delete lines 119–126 (the entire mailpit service definition):

```yaml
# ─── Mailpit (dev SMTP capture) ───────────────────────────────────────────────
# SMTP on 1025, web UI on http://localhost:8025
mailpit:
  image: axllent/mailpit:latest
  restart: unless-stopped
  ports:
    - "1025:1025"
    - "8025:8025"
```

- [ ] **Step 2: Remove the mailpit dependency and dev SMTP defaults from the api service**

In the api service (around lines 60–73), find:

```yaml
# mailpit captures SMTP in dev so emails are visible at http://localhost:8025
SMTP_HOST: ${SMTP_HOST:-mailpit}
SMTP_PORT: ${SMTP_PORT:-1025}
SMTP_FROM: ${SMTP_FROM:-no-reply@budget.local}
SMTP_USER: ${SMTP_USER:-}
SMTP_PASS: ${SMTP_PASS:-}
```

Replace with (no defaults — prod must inject all SMTP env explicitly):

```yaml
SMTP_HOST: ${SMTP_HOST}
SMTP_PORT: ${SMTP_PORT}
SMTP_FROM: ${SMTP_FROM}
SMTP_USER: ${SMTP_USER}
SMTP_PASS: ${SMTP_PASS}
```

In the api `depends_on`, find:

```yaml
depends_on:
  migrator:
    condition: service_completed_successfully
  db:
    condition: service_healthy
  mailpit:
    condition: service_started
```

Remove the `mailpit` dependency:

```yaml
depends_on:
  migrator:
    condition: service_completed_successfully
  db:
    condition: service_healthy
```

- [ ] **Step 3: Verify the prod compose file parses standalone**

Run: `infisical run --env=dev -- docker compose -f docker-compose.yml config 2>&1 | tail -20`

Expected: a fully resolved compose config with five services (db, migrator, api, web, worker) and **no** `mailpit` service.

- [ ] **Step 4: Do not commit yet — wait for B2 (the override file is added together)**

---

### Task B2: Create `docker-compose.override.yml` with mailpit + dev defaults

**Files:**

- Create: `docker-compose.override.yml`
- Delete: `docker-compose.override.yml.example` (superseded)

**Why:** Compose auto-merges `docker-compose.override.yml` on top of `docker-compose.yml` for any `docker compose up` that does not specify `-f`. This is the canonical place for dev-only services and overrides.

- [ ] **Step 1: Write the override file**

Create `docker-compose.override.yml` with this exact content:

```yaml
# docker-compose.override.yml — auto-merged by compose for local dev.
# Adds mailpit (SMTP capture) and points api/worker at it.
# CI uses `docker compose -f docker-compose.yml up` (this file excluded).

services:
  mailpit:
    image: axllent/mailpit:latest
    restart: unless-stopped
    ports:
      - "1025:1025"
      - "8025:8025"

  api:
    environment:
      SMTP_HOST: mailpit
      SMTP_PORT: 1025
      SMTP_FROM: no-reply@budget.local
      SMTP_USER: ""
      SMTP_PASS: ""
    depends_on:
      mailpit:
        condition: service_started

  worker:
    environment:
      SMTP_HOST: mailpit
      SMTP_PORT: 1025
      SMTP_FROM: no-reply@budget.local
      SMTP_USER: ""
      SMTP_PASS: ""
    depends_on:
      mailpit:
        condition: service_started
```

- [ ] **Step 2: Delete the obsolete example file**

```bash
git rm docker-compose.override.yml.example
```

- [ ] **Step 3: Verify the merged config resolves correctly for dev**

Run: `infisical run --env=dev -- docker compose config 2>&1 | head -20`

Expected: includes `mailpit` service and `api.environment.SMTP_HOST=mailpit`.

- [ ] **Step 4: Verify CI mode (prod-only) excludes mailpit**

Run: `infisical run --env=dev -- docker compose -f docker-compose.yml config 2>&1 | grep -c '^  mailpit:'`

Expected: `0`.

- [ ] **Step 5: Restart the stack and verify dev still works**

```bash
infisical run --env=dev -- docker compose down
infisical run --env=dev -- docker compose up -d --wait
infisical run --env=dev -- docker compose ps
```

Expected: db, migrator (Exited 0), api, web, worker, mailpit — all healthy.

Visit `http://localhost:8025` in a browser; mailpit UI should respond.

- [ ] **Step 6: Smoke-test the prod-only stack**

```bash
infisical run --env=dev -- docker compose down
infisical run --env=dev -- docker compose -f docker-compose.yml up -d --wait
infisical run --env=dev -- docker compose -f docker-compose.yml ps
```

Expected: 5 services healthy, no mailpit. (API may log "email transport: stdout" if SMTP_HOST is unset — that is correct prod behaviour without an SMTP provider configured.)

- [ ] **Step 7: Commit B1 + B2 together**

```bash
git add docker-compose.yml docker-compose.override.yml
# docker-compose.override.yml.example was removed via `git rm`
git commit -m "refactor(compose): split prod stack from dev-only mailpit override

docker-compose.yml is now production-ready: only db, migrator, api, web,
worker. SMTP env is required (no dev defaults). Mailpit and the dev SMTP
pointers move to docker-compose.override.yml, which compose auto-merges
for local dev. CI uses 'docker compose -f docker-compose.yml up' to
validate the prod definition."
```

---

## Phase C — Ignore artefacts and prep the local repo for first push

### Task C1: Update `.gitignore` for build artefacts and session caches

**Files:**

- Modify (or Create): `.gitignore`

**Why:** Build caches, IDE caches, and the auto-loaded knowledge graph clutter the working tree. They were left out of prior commits manually but a clean ignore prevents future accidents.

- [ ] **Step 1: Read the current `.gitignore`**

```bash
cat .gitignore
```

If it does not already include each of these patterns, append them. Add a comment delimiter so the new block is easy to spot:

```
# CI/CD prep additions (2026-05-08)
.claude/
graphify-out/
**/tsconfig.tsbuildinfo
playwright-report/
.features-gen/
test-results/
```

- [ ] **Step 2: Verify nothing valuable was being tracked**

```bash
git status --ignored | head -20
git ls-files | grep -E '(\.tsbuildinfo|graphify-out|\.claude/|\.features-gen/)' | head
```

Expected (second command): no output. If anything is listed, it was already tracked — discuss with the user before removing.

- [ ] **Step 3: Commit**

```bash
git add .gitignore
git commit -m "chore: ignore build artefacts and session caches"
```

---

### Task C2: Rename local branch `master` → `main`

No files to change. The remote does not yet exist.

- [ ] **Step 1: Confirm working tree clean**

```bash
git status -sb
```

Expected: `## master` and no uncommitted changes (the optional `?? .claude/` etc. are now gitignored, so should not appear).

- [ ] **Step 2: Rename**

```bash
git branch -m master main
git status -sb
```

Expected: `## main`.

---

### Task C3: Authenticate `gh` CLI via Infisical-stored `GITHUB_TOKEN`

No files to change. The token never enters the working tree.

- [ ] **Step 1: Verify the token exists in Infisical**

Run: `infisical secrets get GITHUB_TOKEN --env=dev --plain | head -c 8 && echo '...'`

Expected: 8 characters followed by `...` — confirms the secret resolves.

- [ ] **Step 2: Authenticate gh**

Run: `infisical run --env=dev -- bash -c 'echo "$GITHUB_TOKEN" | gh auth login --with-token'`

- [ ] **Step 3: Verify auth status**

Run: `gh auth status`

Expected: logged in to github.com as the token's owner with appropriate scopes (must include `repo`, `workflow`, `admin:repo_hook` for branch-protection later).

If scopes are missing, ask the user to regenerate the token with the missing scopes and update Infisical.

---

### Task C4: Create the private GitHub repo and push `main`

No files to change in the working tree. This is a one-time `gh` operation.

- [ ] **Step 1: Verify the repo does not yet exist**

Run: `gh repo view madonzy13claude/budget --json name 2>&1`

Expected: `GraphQL: Could not resolve to a Repository ...`. If the repo already exists, stop and consult the user — pushing into an existing repo with history needs careful consideration.

- [ ] **Step 2: Create + push in one shot**

Run: `infisical run --env=dev -- gh repo create madonzy13claude/budget --private --source=. --description="Family budgeting & wealth tracker" --push`

Expected: prints the repo URL; `git remote -v` now shows `origin` pointing at the new repo.

- [ ] **Step 3: Verify the push**

Run: `gh repo view madonzy13claude/budget --json defaultBranchRef,visibility,nameWithOwner`

Expected: defaultBranchRef.name = "main", visibility = "PRIVATE".

Run: `git log --oneline origin/main | head -5`

Expected: shows the commits from this session (Phase A and B fixes) plus the prior history.

---

## Phase D — Add the new CI/CD pipeline files

All Phase D tasks happen on a feature branch (`ci/pipeline`) and are merged via PR — that PR's run is itself the first proof the pipeline works.

### Task D1: Create the feature branch

- [ ] **Step 1: Create and switch**

```bash
git checkout -b ci/pipeline
```

- [ ] **Step 2: Confirm**

Run: `git branch --show-current`

Expected: `ci/pipeline`.

---

### Task D2: Write `.github/CODEOWNERS`

**Files:**

- Create: `.github/CODEOWNERS`

- [ ] **Step 1: Write the file**

```
# Default owner for everything in the repo
* @madonzy13claude
```

- [ ] **Step 2: Commit**

```bash
git add .github/CODEOWNERS
git commit -m "chore(github): add CODEOWNERS"
```

---

### Task D3: Write `.github/dependabot.yml`

**Files:**

- Create: `.github/dependabot.yml`

- [ ] **Step 1: Write the file**

```yaml
version: 2
updates:
  - package-ecosystem: "npm"
    directory: "/"
    schedule:
      interval: "weekly"
      day: "monday"
    open-pull-requests-limit: 10
    groups:
      types:
        patterns: ["@types/*"]
      eslint:
        patterns:
          - "eslint"
          - "eslint-*"
          - "@typescript-eslint/*"
      drizzle:
        patterns: ["drizzle-*"]
      better-auth:
        patterns:
          - "better-auth"
          - "@better-auth/*"
      hono:
        patterns:
          - "hono"
          - "@hono/*"

  - package-ecosystem: "github-actions"
    directory: "/"
    schedule:
      interval: "weekly"

  - package-ecosystem: "docker"
    directories:
      - "/apps/api"
      - "/apps/web"
      - "/apps/worker"
      - "/apps/migrator"
    schedule:
      interval: "weekly"
```

- [ ] **Step 2: Commit**

```bash
git add .github/dependabot.yml
git commit -m "chore(github): add dependabot config (npm + actions + docker)"
```

---

### Task D4: Replace `.github/workflows/ci.yml` with the full version

**Files:**

- Modify: `.github/workflows/ci.yml` (full rewrite)

- [ ] **Step 1: Overwrite the file**

```yaml
name: CI

on:
  pull_request:
    branches: [main]
  push:
    branches: [main]
  workflow_dispatch:

concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true

permissions:
  contents: read
  security-events: write
  pull-requests: read

jobs:
  lint:
    name: Lint (ESLint + Prettier)
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: 1.3.x
      - name: Install dependencies
        run: bun install --frozen-lockfile
      - name: ESLint
        run: bunx eslint apps packages --ext .ts,.tsx --max-warnings 0
      - name: Prettier
        run: bunx prettier --check "apps/**/*.{ts,tsx}" "packages/**/*.{ts,tsx}" "tests/**/*.ts"

  typecheck:
    name: Typecheck (workspaces)
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: 1.3.x
      - name: Install dependencies
        run: bun install --frozen-lockfile
      - name: Typecheck all workspaces
        run: bun run typecheck

  depcheck:
    name: dependency-cruiser
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: 1.3.x
      - name: Install dependencies
        run: bun install --frozen-lockfile
      - name: dependency-cruiser
        run: bunx depcruise --config .dependency-cruiser.cjs --output-type err apps packages

  grep-gates:
    name: Grep gates (PC-03, PC-04)
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: 1.3.x
      - name: ban .transaction( outside tx.ts (PC-04)
        run: bun run grep:no-direct-tx
      - name: ban appPool().connect( outside tx.ts (PC-03)
        run: bun run grep:no-pool-connect

  unit-tests:
    name: Unit tests (bun:test)
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: 1.3.x
      - name: Install dependencies
        run: bun install --frozen-lockfile
      - name: bun test
        run: bun test
      - name: Upload coverage
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: coverage-bun
          path: coverage/
          if-no-files-found: ignore

  web-tests:
    name: Web tests (Vitest)
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: 1.3.x
      - uses: actions/setup-node@v4
        with:
          node-version: "20"
      - name: Install dependencies
        run: bun install --frozen-lockfile
      - name: Vitest
        run: bunx vitest run --root apps/web

  tenant-leak-gate:
    name: Tenant leak gate (T-1, T-2, T-3, PC-08, PC-12)
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:17-alpine
        env:
          POSTGRES_PASSWORD: postgres
          POSTGRES_USER: postgres
          POSTGRES_DB: budget
        ports: ["5432:5432"]
        options: >-
          --health-cmd "pg_isready -U postgres"
          --health-interval 5s
          --health-timeout 5s
          --health-retries 10
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: 1.3.x
      - name: Install dependencies
        run: bun install --frozen-lockfile
      - name: Create DB roles (NOBYPASSRLS)
        run: |
          PGPASSWORD=postgres psql -h localhost -U postgres -d budget -c "CREATE ROLE migrator LOGIN PASSWORD 'migrator_pwd' NOBYPASSRLS NOCREATEROLE;"
          PGPASSWORD=postgres psql -h localhost -U postgres -d budget -c "CREATE ROLE app_role LOGIN PASSWORD 'app_pwd' NOBYPASSRLS NOCREATEROLE;"
          PGPASSWORD=postgres psql -h localhost -U postgres -d budget -c "CREATE ROLE worker_role LOGIN PASSWORD 'worker_pwd' NOBYPASSRLS NOCREATEROLE;"
          PGPASSWORD=postgres psql -h localhost -U postgres -d budget -c "GRANT ALL ON SCHEMA public TO migrator;"
          PGPASSWORD=postgres psql -h localhost -U postgres -d budget -c "GRANT CREATE ON DATABASE budget TO migrator;"
      - name: Run Drizzle migrations
        env:
          DATABASE_URL_MIGRATOR: postgresql://migrator:migrator_pwd@localhost:5432/budget
        run: bunx drizzle-kit migrate --config apps/migrator/drizzle.config.ts
      - name: Apply post-migration SQL
        run: PGPASSWORD=postgres psql -h localhost -U postgres -d budget -f apps/migrator/post-migration.sql
      - name: Run tenant-leak tests (Tests 1-5)
        env:
          DATABASE_URL_APP: postgresql://app_role:app_pwd@localhost:5432/budget
          DATABASE_URL_WORKER: postgresql://worker_role:worker_pwd@localhost:5432/budget
          DATABASE_URL_MIGRATOR: postgresql://migrator:migrator_pwd@localhost:5432/budget
        run: bun test tests/tenant-leak --timeout 30000

  compose-smoke:
    name: Compose smoke (prod-only)
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: 1.3.x
      - name: Install dependencies
        run: bun install --frozen-lockfile
      - name: Generate test .env from CI placeholders
        run: |
          cat > .env <<EOF
          POSTGRES_PASSWORD=postgres
          APP_ROLE_PASSWORD=app_pwd
          WORKER_ROLE_PASSWORD=worker_pwd
          MIGRATOR_ROLE_PASSWORD=migrator_pwd
          DATABASE_URL_APP=postgresql://app_role:app_pwd@db:5432/budget
          DATABASE_URL_WORKER=postgresql://worker_role:worker_pwd@db:5432/budget
          DATABASE_URL_MIGRATOR=postgresql://migrator:migrator_pwd@db:5432/budget
          BUDGET_KEK=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=
          BETTER_AUTH_SECRET=ci-test-secret-must-be-at-least-32-characters-long
          BETTER_AUTH_URL=http://localhost:3000
          APP_URL=http://localhost:3000
          TRUSTED_ORIGINS=http://localhost:3000
          SMTP_HOST=
          SMTP_PORT=0
          SMTP_FROM=
          SMTP_USER=
          SMTP_PASS=
          REGION=ci
          LOG_LEVEL=info
          EOF
      - name: Build prod-only stack
        run: docker compose -f docker-compose.yml build
      - name: Start prod-only stack and wait for health
        run: docker compose -f docker-compose.yml up -d --wait
      - name: Verify mailpit is NOT in this stack
        run: |
          if docker compose -f docker-compose.yml ps --services | grep -qx mailpit; then
            echo "FAIL: mailpit must not be in prod compose"
            exit 1
          fi
      - name: Curl healthchecks
        run: |
          curl -f http://localhost:3000/en/health
      - name: Tear down
        if: always()
        run: docker compose -f docker-compose.yml down -v --remove-orphans

  e2e:
    name: E2E (Playwright BDD)
    needs: [compose-smoke]
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: 1.3.x
      - uses: actions/setup-node@v4
        with:
          node-version: "20"
      - name: Install dependencies
        run: bun install --frozen-lockfile
      - name: Install Playwright browsers
        run: bunx playwright install --with-deps chromium
      - name: Generate test .env (with mailpit for dev override)
        run: |
          cat > .env <<EOF
          POSTGRES_PASSWORD=postgres
          APP_ROLE_PASSWORD=app_pwd
          WORKER_ROLE_PASSWORD=worker_pwd
          MIGRATOR_ROLE_PASSWORD=migrator_pwd
          DATABASE_URL_APP=postgresql://app_role:app_pwd@db:5432/budget
          DATABASE_URL_WORKER=postgresql://worker_role:worker_pwd@db:5432/budget
          DATABASE_URL_MIGRATOR=postgresql://migrator:migrator_pwd@db:5432/budget
          BUDGET_KEK=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=
          BETTER_AUTH_SECRET=ci-test-secret-must-be-at-least-32-characters-long
          BETTER_AUTH_URL=http://localhost:3000
          APP_URL=http://localhost:3000
          TRUSTED_ORIGINS=http://localhost:3000
          REGION=ci
          LOG_LEVEL=info
          EOF
      - name: Start full dev stack (compose with override = mailpit included)
        run: docker compose up -d --wait
      - name: Run Playwright BDD
        env:
          PLAYWRIGHT_BASE_URL: http://localhost:3000
          CI: "1"
        run: bunx bddgen && bunx playwright test --reporter=list
      - name: Upload Playwright report
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: playwright-report
          path: playwright-report/
          if-no-files-found: ignore
      - name: Tear down
        if: always()
        run: docker compose down -v --remove-orphans

  codeql:
    name: CodeQL (SAST)
    runs-on: ubuntu-latest
    permissions:
      security-events: write
      contents: read
    steps:
      - uses: actions/checkout@v4
      - uses: github/codeql-action/init@v3
        with:
          languages: javascript-typescript
      - uses: github/codeql-action/analyze@v3

  gitleaks:
    name: Gitleaks (secret scan)
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: gitleaks/gitleaks-action@v2
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}

  bun-audit:
    name: Bun audit (HIGH+)
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: 1.3.x
      - name: Install dependencies
        run: bun install --frozen-lockfile
      - name: bun pm audit (root)
        run: bun pm audit --audit-level=high

  dockerfile-lint:
    name: hadolint (Dockerfile lint)
    runs-on: ubuntu-latest
    strategy:
      fail-fast: false
      matrix:
        service: [api, web, worker, migrator]
    steps:
      - uses: actions/checkout@v4
      - uses: hadolint/hadolint-action@v3.1.0
        with:
          dockerfile: apps/${{ matrix.service }}/Dockerfile
          failure-threshold: error
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: replace ci.yml with full quality + security gate suite"
```

---

### Task D5: Delete the obsolete `tenant-leak.yml`

**Files:**

- Delete: `.github/workflows/tenant-leak.yml`

**Why:** Its job is now folded into `ci.yml` as `tenant-leak-gate` and runs on every PR.

- [ ] **Step 1: Delete**

```bash
git rm .github/workflows/tenant-leak.yml
```

- [ ] **Step 2: Commit**

```bash
git commit -m "ci: remove standalone tenant-leak.yml (now part of ci.yml)"
```

---

### Task D6: Write `.github/workflows/release.yml`

**Files:**

- Create: `.github/workflows/release.yml`

- [ ] **Step 1: Write the file**

```yaml
name: Release

on:
  push:
    tags: ["v*"]

concurrency:
  group: release-${{ github.ref }}
  cancel-in-progress: false

permissions:
  contents: write
  packages: write
  id-token: write

jobs:
  validate-tag:
    name: Validate tag is strict SemVer
    runs-on: ubuntu-latest
    steps:
      - name: Reject non-SemVer tags
        run: |
          TAG="${GITHUB_REF_NAME}"
          if [[ ! "$TAG" =~ ^v[0-9]+\.[0-9]+\.[0-9]+(-[A-Za-z0-9.-]+)?$ ]]; then
            echo "Tag '$TAG' is not strict SemVer (vMAJOR.MINOR.PATCH[-PRERELEASE])"
            exit 1
          fi
          echo "Tag '$TAG' validated"

  verify-ci-green:
    name: Verify CI was green on tagged commit
    runs-on: ubuntu-latest
    needs: [validate-tag]
    steps:
      - uses: actions/checkout@v4
      - name: Check CI status of tagged SHA
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          SHA="${GITHUB_SHA}"
          STATE=$(gh api "repos/${{ github.repository }}/commits/${SHA}/status" -q '.state')
          echo "Combined status for $SHA: $STATE"
          if [[ "$STATE" != "success" ]]; then
            echo "CI is not green on $SHA — refusing to release"
            exit 1
          fi

  build-and-push:
    name: Build & push ${{ matrix.service }}
    needs: [verify-ci-green]
    runs-on: ubuntu-latest
    strategy:
      fail-fast: false
      matrix:
        service: [api, web, worker, migrator]
    steps:
      - uses: actions/checkout@v4

      - uses: docker/setup-buildx-action@v3

      - name: Login to DockerHub
        uses: docker/login-action@v3
        with:
          username: ${{ secrets.DOCKERHUB_USERNAME }}
          password: ${{ secrets.DOCKERHUB_TOKEN }}

      - name: Compute image tags
        id: meta
        uses: docker/metadata-action@v5
        with:
          images: madonzy13claude/budget-${{ matrix.service }}
          tags: |
            type=semver,pattern={{version}}
            type=semver,pattern={{major}}.{{minor}}
            type=raw,value=latest,enable=${{ !contains(github.ref_name, '-') }}
            type=sha,format=short

      - name: Build & push
        id: build
        uses: docker/build-push-action@v6
        with:
          context: .
          file: apps/${{ matrix.service }}/Dockerfile
          platforms: linux/amd64
          push: true
          tags: ${{ steps.meta.outputs.tags }}
          labels: ${{ steps.meta.outputs.labels }}
          cache-from: type=gha,scope=${{ matrix.service }}
          cache-to: type=gha,mode=max,scope=${{ matrix.service }}

      - name: Trivy scan (CRITICAL fails)
        uses: aquasecurity/trivy-action@master
        with:
          image-ref: madonzy13claude/budget-${{ matrix.service }}@${{ steps.build.outputs.digest }}
          format: sarif
          output: trivy-${{ matrix.service }}.sarif
          severity: CRITICAL,HIGH
          exit-code: "0" # don't fail on HIGH; CRITICAL is enforced below
          ignore-unfixed: true

      - name: Fail on Trivy CRITICAL
        run: |
          if jq -e '.runs[].results[] | select(.level == "error")' trivy-${{ matrix.service }}.sarif > /dev/null; then
            echo "Trivy reported CRITICAL findings"
            exit 1
          fi

      - name: Upload Trivy SARIF
        if: always()
        uses: github/codeql-action/upload-sarif@v3
        with:
          sarif_file: trivy-${{ matrix.service }}.sarif
          category: trivy-${{ matrix.service }}

      - name: Generate SBOM
        uses: anchore/sbom-action@v0
        with:
          image: madonzy13claude/budget-${{ matrix.service }}@${{ steps.build.outputs.digest }}
          format: spdx-json
          output-file: sbom-${{ matrix.service }}.spdx.json

      - name: Upload SBOM artifact
        uses: actions/upload-artifact@v4
        with:
          name: sbom-${{ matrix.service }}
          path: sbom-${{ matrix.service }}.spdx.json

  github-release:
    name: GitHub Release
    needs: [build-and-push]
    runs-on: ubuntu-latest
    permissions:
      contents: write
    steps:
      - uses: actions/checkout@v4

      - name: Download all SBOMs
        uses: actions/download-artifact@v4
        with:
          path: sboms
          pattern: sbom-*
          merge-multiple: true

      - name: Build release notes body
        id: body
        run: |
          {
            echo 'BODY<<EOF'
            echo "## Images"
            echo
            echo '| Service | Image |'
            echo '|---|---|'
            for s in api web worker migrator; do
              echo "| $s | \`madonzy13claude/budget-$s:${GITHUB_REF_NAME#v}\` |"
            done
            echo
            echo 'EOF'
          } >> "$GITHUB_OUTPUT"

      - name: Create GitHub Release
        uses: softprops/action-gh-release@v2
        with:
          generate_release_notes: true
          prerelease: ${{ contains(github.ref_name, '-') }}
          body: ${{ steps.body.outputs.BODY }}
          files: |
            sboms/sbom-*.spdx.json
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/release.yml
git commit -m "ci: add release.yml — tag-driven DockerHub publish + GH release"
```

---

### Task D7: Write `.github/workflows/auto-merge.yml`

**Files:**

- Create: `.github/workflows/auto-merge.yml`

- [ ] **Step 1: Write the file**

```yaml
name: Dependabot auto-merge

on:
  pull_request:
    types: [opened, synchronize, reopened]

permissions:
  contents: write
  pull-requests: write

jobs:
  auto-merge:
    if: github.actor == 'dependabot[bot]'
    runs-on: ubuntu-latest
    steps:
      - name: Fetch Dependabot metadata
        id: meta
        uses: dependabot/fetch-metadata@v2
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}

      - name: Enable auto-merge for patch + minor updates
        if: |
          steps.meta.outputs.update-type == 'version-update:semver-patch' ||
          steps.meta.outputs.update-type == 'version-update:semver-minor'
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          PR_URL: ${{ github.event.pull_request.html_url }}
        run: gh pr merge --auto --squash "$PR_URL"

      - name: Comment on major updates
        if: steps.meta.outputs.update-type == 'version-update:semver-major'
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          PR_URL: ${{ github.event.pull_request.html_url }}
        run: |
          gh pr comment "$PR_URL" \
            --body "Major version bump (\`${{ steps.meta.outputs.dependency-name }}\` ${{ steps.meta.outputs.previous-version }} → ${{ steps.meta.outputs.new-version }}). Auto-merge withheld pending manual review."
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/auto-merge.yml
git commit -m "ci: add auto-merge for Dependabot patch + minor PRs"
```

---

### Task D8: Add `scripts/setup/branch-protection.sh`

**Files:**

- Create: `scripts/setup/branch-protection.sh`

**Why:** Branch protection cannot be configured by a workflow (chicken-and-egg). A checked-in script makes the protection state reproducible and reviewable.

- [ ] **Step 1: Write the script**

```bash
#!/usr/bin/env bash
# scripts/setup/branch-protection.sh
# Idempotently configure branch protection on `main` for madonzy13claude/budget.
# Requires: gh CLI authenticated with admin:repo_hook + repo scopes.

set -euo pipefail

REPO="${REPO:-madonzy13claude/budget}"
BRANCH="${BRANCH:-main}"

echo "Configuring branch protection on ${REPO}@${BRANCH}..."

# Required status checks must match the job NAMES in ci.yml exactly.
read -r -d '' BODY <<'JSON' || true
{
  "required_status_checks": {
    "strict": true,
    "checks": [
      { "context": "Lint (ESLint + Prettier)" },
      { "context": "Typecheck (workspaces)" },
      { "context": "dependency-cruiser" },
      { "context": "Grep gates (PC-03, PC-04)" },
      { "context": "Unit tests (bun:test)" },
      { "context": "Web tests (Vitest)" },
      { "context": "Tenant leak gate (T-1, T-2, T-3, PC-08, PC-12)" },
      { "context": "Compose smoke (prod-only)" },
      { "context": "E2E (Playwright BDD)" },
      { "context": "CodeQL (SAST)" },
      { "context": "Gitleaks (secret scan)" },
      { "context": "Bun audit (HIGH+)" }
    ]
  },
  "enforce_admins": false,
  "required_pull_request_reviews": null,
  "restrictions": null,
  "required_linear_history": true,
  "allow_force_pushes": false,
  "allow_deletions": false,
  "required_conversation_resolution": true,
  "lock_branch": false,
  "allow_fork_syncing": false
}
JSON

echo "$BODY" | gh api \
  --method PUT \
  -H "Accept: application/vnd.github+json" \
  "repos/${REPO}/branches/${BRANCH}/protection" \
  --input -

echo "Branch protection applied to ${REPO}@${BRANCH}."

# Enable repo-level auto-merge (required for the auto-merge.yml workflow)
gh api \
  --method PATCH \
  -H "Accept: application/vnd.github+json" \
  "repos/${REPO}" \
  -f allow_auto_merge=true \
  -f allow_squash_merge=true \
  -f allow_merge_commit=false \
  -f allow_rebase_merge=false \
  -f delete_branch_on_merge=true >/dev/null

echo "Repo-level merge settings updated (auto-merge on, squash-only, branch deletion on merge)."
```

- [ ] **Step 2: Make executable + commit**

```bash
chmod +x scripts/setup/branch-protection.sh
git add scripts/setup/branch-protection.sh
git commit -m "chore(setup): add reproducible branch-protection script"
```

Note: `dockerfile-lint` is intentionally **not** in the required checks list — it is a matrix job that runs but does not block (matches design §4 "any error" being a fail signal but matrix jobs are reported per-service). If you want to require it, list each `hadolint (Dockerfile lint) (api)` etc. — leave for a future tightening.

---

### Task D9: Open the first PR

- [ ] **Step 1: Push the branch**

```bash
git push -u origin ci/pipeline
```

- [ ] **Step 2: Open the PR**

```bash
gh pr create \
  --title "ci: add full CI/CD pipeline (workflows + dependabot + compose split)" \
  --body "$(cat <<'EOF'
## Summary
- Three workflows: ci.yml (PR gate), release.yml (tag-driven DockerHub publish), auto-merge.yml (Dependabot patch+minor)
- dependabot.yml for npm, github-actions, and docker
- CODEOWNERS, branch-protection setup script
- Pre-existing red bars (lint, typecheck, vitest, e2e flake) fixed in earlier commits on this branch
- docker-compose.yml split: prod-only services in base, mailpit + dev SMTP in docker-compose.override.yml

## Test plan
- [ ] All ci.yml jobs go green on this PR
- [ ] After merge, the next tag `v0.1.0-rc.1` triggers release.yml end-to-end
- [ ] Dependabot opens a patch PR within a week and it auto-merges

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 3: Watch the run**

```bash
gh pr checks --watch
```

Expected: every check turns green within 15 minutes. If any fails, fix on the same branch and push again.

---

## Phase E — Configure GitHub-side state

### Task E1: Mirror DockerHub secrets to the GitHub repo

No file changes. The token never enters the working tree.

- [ ] **Step 1: Set DOCKERHUB_USERNAME**

```bash
gh secret set DOCKERHUB_USERNAME --body "madonzy13claude"
```

- [ ] **Step 2: Set DOCKERHUB_TOKEN from Infisical**

```bash
infisical run --env=dev -- bash -c 'gh secret set DOCKERHUB_TOKEN --body "$DOCKER_HUB_TOKEN"'
```

- [ ] **Step 3: Verify both are set**

```bash
gh secret list
```

Expected: both `DOCKERHUB_USERNAME` and `DOCKERHUB_TOKEN` listed.

---

### Task E2: Apply branch protection

- [ ] **Step 1: Run the script**

```bash
./scripts/setup/branch-protection.sh
```

Expected: prints `Branch protection applied to madonzy13claude/budget@main.` and `Repo-level merge settings updated...`.

If you get a 422 about a status check not yet existing, that means the PR from Phase D has not finished its first run yet — wait for `gh pr checks --watch` to complete and re-run the script.

- [ ] **Step 2: Verify**

```bash
gh api repos/madonzy13claude/budget/branches/main/protection -q '.required_status_checks.contexts'
```

Expected: a JSON array containing all the check names from the script.

---

### Task E3: Merge the first PR

- [ ] **Step 1: Merge from CLI now that protection is on**

```bash
gh pr merge ci/pipeline --squash --delete-branch
```

Expected: merges if all required checks are green; otherwise prints which checks are blocking.

- [ ] **Step 2: Sync local main**

```bash
git checkout main
git pull --ff-only
```

---

## Phase F — Validate the release pipeline with an `rc` tag

### Task F1: Cut `v0.1.0-rc.1`

- [ ] **Step 1: Tag**

```bash
git checkout main
git pull --ff-only
git tag -a v0.1.0-rc.1 -m "rc.1 — first release candidate (validates release.yml)"
git push origin v0.1.0-rc.1
```

- [ ] **Step 2: Watch the workflow**

```bash
gh run watch
```

Expected: `release.yml` runs `validate-tag` → `verify-ci-green` → 4 parallel `build-and-push` jobs → `github-release`. Total runtime ~15–20 min.

- [ ] **Step 3: Verify DockerHub**

```bash
for s in api web worker migrator; do
  curl -s "https://hub.docker.com/v2/repositories/madonzy13claude/budget-${s}/tags/?page_size=10" \
    | python3 -c "import sys, json; print('${s}:', [t['name'] for t in json.load(sys.stdin)['results']])"
done
```

Expected for each: tags include `0.1.0-rc.1`, `sha-<short>` — and **no** `latest`, **no** `0.1`.

- [ ] **Step 4: Verify GH prerelease**

```bash
gh release view v0.1.0-rc.1 --json isPrerelease,assets,name,tagName
```

Expected: `isPrerelease: true`, four `sbom-*.spdx.json` assets attached, body contains the four-image manifest.

---

### Task F2: Diagnose-and-fix loop if F1 reveals issues

If anything in F1 is red, do not advance to GA. Common likely failures and the fix to apply:

- **`validate-tag` fails:** the tag string had a bad format. Delete tag (`git push origin :v0.1.0-rc.1`), re-tag correctly.
- **`verify-ci-green` fails:** the tagged commit's CI never went green. Push a fix to `main`, re-tag from the new commit.
- **`build-and-push` fails on `docker/login-action`:** secrets not mirrored — see Task E1.
- **`Trivy CRITICAL` fails:** a base image picked up a new critical CVE. Update the Dockerfile's base image to the latest patch (`oven/bun:1.3.x-alpine` etc.), re-tag.

For each fix: commit, push, delete the failed tag, re-tag, re-push.

---

## Phase G — Cut the first GA tag

### Task G1: Tag `v0.1.0`

- [ ] **Step 1: Tag and push**

```bash
git checkout main
git pull --ff-only
git tag -a v0.1.0 -m "v0.1.0 — Phase 1 foundations GA"
git push origin v0.1.0
```

- [ ] **Step 2: Watch + verify DockerHub**

```bash
gh run watch
for s in api web worker migrator; do
  curl -s "https://hub.docker.com/v2/repositories/madonzy13claude/budget-${s}/tags/?page_size=10" \
    | python3 -c "import sys, json; print('${s}:', [t['name'] for t in json.load(sys.stdin)['results']])"
done
```

Expected: each image has tags `0.1.0`, `0.1`, `latest`, and `sha-<short>`.

- [ ] **Step 3: Verify GH Release (GA)**

```bash
gh release view v0.1.0 --json isPrerelease,assets,name
```

Expected: `isPrerelease: false`, four SBOM assets, generated changelog body.

---

## Phase H — Validate auto-merge

### Task H1: Wait for first Dependabot PR

There is no immediate action — Dependabot runs on the schedule defined in `dependabot.yml` (Monday weekly). To force one early, either:

- **Wait** for next Monday and let it run normally.
- **Trigger manually:** `gh api -X POST repos/madonzy13claude/budget/dispatches -f event_type=dependabot-rerun` is **not** how Dependabot is triggered. Instead, edit any single dep version in `package.json` to be slightly behind latest and let Dependabot open the catch-up PR — or just wait.

Recommended: wait for the natural cycle.

- [ ] **Step 1: When the first Dependabot PR opens, observe**

```bash
gh pr list --label dependencies
gh pr checks <pr-number> --watch
```

Expected for a patch update: `auto-merge.yml` runs, calls `gh pr merge --auto --squash`, and once `ci.yml` finishes green GitHub merges automatically.

- [ ] **Step 2: Confirm auto-merge logic for major bumps (when one eventually opens)**

Expected: a comment posted by the workflow ("Major version bump … Auto-merge withheld pending manual review"), no auto-merge enabled.

---

## Self-Review Checklist (run by the implementing engineer at the end)

- [ ] **Spec coverage:** every section of `docs/superpowers/specs/2026-05-08-cicd-design.md` maps to at least one task above. Section §13 step order matches Phases A → G in this plan.
- [ ] **No placeholders:** scan the plan for `TBD`, `TODO`, `add appropriate ...`, `similar to Task N`. None must remain.
- [ ] **Type/name consistency:** the workflow names (`ci.yml`, `release.yml`, `auto-merge.yml`) match between every reference. The job names in the branch-protection script match exactly the `name:` fields in `ci.yml`. Image names use `madonzy13claude/budget-<service>` everywhere.
- [ ] **All commits frequent:** no task batches more than one logical change per commit.
- [ ] **Tests precede behaviour where relevant:** the pre-existing red bar fixes (Phase A) start with the failing run, then the fix, then the passing run.

If anything is off, fix it before invoking the implementing skill.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-08-cicd-implementation.md`. Two execution options:

1. **Subagent-Driven (recommended)** — dispatch a fresh subagent per task, review between tasks, fast iteration. Best for this plan because each task is small and reviewing diffs between tasks catches drift early.
2. **Inline Execution** — execute tasks in this session using `executing-plans`, batching with checkpoints for review.

**Which approach?**
