# CI/CD Pipeline — Design Spec

**Date:** 2026-05-08
**Status:** Approved (awaiting implementation plan)
**Owner:** Budget Owner
**Repo:** GitHub.com (private), default branch `main`
**DockerHub namespace:** `madonzy13claude`

---

## 1. Goals

1. Every PR is automatically validated against the full quality bar: lint, typecheck, unit, web component, tenant-leak gate, prod-compose smoke, full Playwright E2E, three security scans (CodeQL, Gitleaks, Trivy), and a dependency CVE audit.
2. Every git tag matching `v*` automatically builds, scans, and publishes four production Docker images to DockerHub, then creates a GitHub Release with auto-generated notes and SBOMs.
3. Dependabot patch and minor PRs auto-merge once CI is green; major bumps stay manual.
4. The production `docker-compose.yml` defines only what runs in production; dev-only services (mailpit) live in a separate compose override that loads automatically for local dev.

## 2. Non-goals (v1)

- Deploying to a hosted environment. Pipeline stops at "image in DockerHub". Deployment to a VM/k8s cluster is a future phase.
- Multi-arch images. `linux/amd64` only at v1; `arm64` deferred until there is a concrete user need.
- Image signing (cosign). Deferred — Trivy scan + private-repo source-of-truth is sufficient for v1.
- Reusable workflows (`workflow_call`). Three workflows have minimal duplication. Refactor to reusables only when duplication exceeds a threshold.

## 3. Repository topology

```
.github/
├── workflows/
│   ├── ci.yml              # PR + push gate (everything green or block merge)
│   ├── release.yml         # tag v* → build, scan, push, GH release
│   └── auto-merge.yml      # Dependabot patch+minor auto-merge enabler
├── dependabot.yml          # weekly version updates for npm + github-actions + docker
└── CODEOWNERS              # default owner = repo owner

docker-compose.yml           # PROD: db + migrator + api + web + worker
docker-compose.override.yml  # DEV: mailpit + dev volume mounts (auto-loaded by compose)
```

**Files removed by this spec**

- `.github/workflows/tenant-leak.yml` — its job is folded into `ci.yml` as `tenant-leak-gate` and runs on every PR (no longer needs a separate fast-feedback workflow because the main `ci.yml` is fast enough).
- `docker-compose.override.yml.example` — superseded by an actual `docker-compose.override.yml` (since dev-only services are now the override's job).

## 4. Workflow: `ci.yml`

**Triggers**

```yaml
on:
  pull_request:
    branches: [main]
  push:
    branches: [main]
  workflow_dispatch:
```

**Concurrency**

```yaml
concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true
```

**Jobs (parallel where independent)**

| Job ID             | Purpose                                                                                                          | Service deps       | Failure threshold                                       |
| ------------------ | ---------------------------------------------------------------------------------------------------------------- | ------------------ | ------------------------------------------------------- |
| `lint`             | ESLint + `prettier --check` over `apps`, `packages`, `tests`                                                     | none               | any error or warning                                    |
| `typecheck`        | `bun run typecheck` (`bun --filter='*' typecheck`)                                                               | none               | any TS error                                            |
| `depcheck`         | `dependency-cruiser` per `.dependency-cruiser.cjs`                                                               | none               | any rule violation                                      |
| `grep-gates`       | `bun run grep:no-direct-tx` and `bun run grep:no-pool-connect`                                                   | none               | any match                                               |
| `unit-tests`       | `bun test` from repo root (uses Docker for testcontainers)                                                       | docker available   | any failure or coverage drop below 80% domain threshold |
| `web-tests`        | `bunx vitest run --root apps/web`                                                                                | none               | any failure                                             |
| `tenant-leak-gate` | `scripts/ci/run-tenant-leak.sh` against postgres service                                                         | postgres:17-alpine | any failure                                             |
| `compose-smoke`    | `docker compose -f docker-compose.yml up -d --wait` (no override) → `curl /health` on api + web → `compose down` | docker             | any unhealthy container                                 |
| `e2e`              | Playwright BDD against the smoke compose stack                                                                   | docker             | any test failure                                        |
| `codeql`           | `github/codeql-action` for `javascript-typescript`                                                               | none               | any HIGH+ alert                                         |
| `gitleaks`         | `gitleaks/gitleaks-action` over full diff                                                                        | none               | any secret found                                        |
| `bun-audit`        | `bun pm audit --audit-level=high` (root + each workspace)                                                        | none               | any HIGH+ advisory                                      |
| `dockerfile-lint`  | `hadolint-action` on each Dockerfile                                                                             | none               | any error (warnings allowed but reported)               |

**Build matrix details**

- All Bun jobs: `oven-sh/setup-bun@v2` with `bun-version: 1.3.x` (track latest patch)
- All Node-needed jobs: `actions/setup-node@v4` with `node-version: 20`
- `bun install --frozen-lockfile` on every job that runs JS/TS

**Postgres service config (tenant-leak-gate)**

Identical to current `tenant-leak-gate` in `ci.yml` (postgres:17-alpine, NOBYPASSRLS roles created, drizzle migrations applied, post-migration.sql applied).

## 5. Workflow: `release.yml`

**Trigger**

```yaml
on:
  push:
    tags: ["v*"]
```

Tag must follow strict SemVer: `v<major>.<minor>.<patch>` or `v<major>.<minor>.<patch>-<prerelease>` (e.g. `v0.1.0-rc.1`). A workflow step rejects any non-conforming tag.

**Concurrency:** `group: release-${{ github.ref }}, cancel-in-progress: false` (a release in flight must finish — never cancel mid-publish).

**Jobs**

### 5.1 `verify-ci-green`

Calls the GitHub Checks API for the tagged commit. If the most recent `ci.yml` run on that commit is not "success", fail immediately. Prevents publishing a tag whose commit never passed CI.

### 5.2 `build-and-push` — matrix `service`: `[api, web, worker, migrator]`

Steps per matrix entry:

1. `actions/checkout@v4`
2. `docker/setup-buildx-action@v3`
3. `docker/login-action@v3` with `username: ${{ secrets.DOCKERHUB_USERNAME }}`, `password: ${{ secrets.DOCKERHUB_TOKEN }}`
4. `docker/metadata-action@v5` to compute tags:
   - `type=semver,pattern={{version}}` → `v0.1.0` becomes `0.1.0`
   - `type=semver,pattern={{major}}.{{minor}}` → `0.1`
   - `type=raw,value=latest,enable={{is_default_branch and !contains(github.ref_name, '-')}}` (no `latest` for prereleases)
   - `type=sha,format=short` → `sha-abc1234`
5. `docker/build-push-action@v6`:
   - `context: .`
   - `file: apps/${{ matrix.service }}/Dockerfile`
   - `platforms: linux/amd64`
   - `cache-from: type=gha,scope=${{ matrix.service }}`
   - `cache-to:   type=gha,mode=max,scope=${{ matrix.service }}`
   - `push: true`
   - `tags: ${{ steps.meta.outputs.tags }}`
   - `labels: ${{ steps.meta.outputs.labels }}` (OCI labels: source, revision, version)
6. `aquasecurity/trivy-action@latest` against the freshly pushed image — fail on `CRITICAL`, report `HIGH` non-fatally
7. Upload SBOM (`anchore/sbom-action`) as workflow artifact

### 5.3 `github-release` (depends on `build-and-push`)

1. `softprops/action-gh-release@v2` — uses GH auto-generated changelog
2. Attach SBOM artifacts from prior job
3. Mark as prerelease iff tag contains `-` (e.g. `v0.1.0-rc.1`)
4. Body includes a four-line image manifest table:
   ```
   madonzy13claude/budget-api:0.1.0       (sha: abc1234)
   madonzy13claude/budget-web:0.1.0
   madonzy13claude/budget-worker:0.1.0
   madonzy13claude/budget-migrator:0.1.0
   ```

## 6. Workflow: `auto-merge.yml`

**Trigger**

```yaml
on:
  pull_request:
    types: [opened, synchronize, reopened]
```

Skip for non-Dependabot PRs early. Use `dependabot/fetch-metadata@v2` to extract `update-type`. If `update-type ∈ {version-update:semver-patch, version-update:semver-minor}`:

```yaml
- run: gh pr merge --auto --squash "$PR_URL"
  env:
    PR_URL: ${{ github.event.pull_request.html_url }}
    GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

GitHub then merges automatically once all required `ci.yml` checks are green.

For `version-update:semver-major`, post a comment "Major bump — manual review required" and do not enable auto-merge.

## 7. `dependabot.yml`

```yaml
version: 2
updates:
  - package-ecosystem: "npm"
    directory: "/"
    schedule: { interval: "weekly", day: "monday" }
    open-pull-requests-limit: 10
    groups:
      types: { patterns: ["@types/*"] }
      eslint: { patterns: ["eslint", "eslint-*", "@typescript-eslint/*"] }
      drizzle: { patterns: ["drizzle-*"] }
      better-auth: { patterns: ["better-auth", "@better-auth/*"] }
  - package-ecosystem: "github-actions"
    directory: "/"
    schedule: { interval: "weekly" }
  - package-ecosystem: "docker"
    directories: ["/apps/api", "/apps/web", "/apps/worker", "/apps/migrator"]
    schedule: { interval: "weekly" }
```

## 8. Branch protection (configured via `gh api` script after first push)

`main` rules:

- Require pull request before merging
- Require status checks before merging:
  `lint`, `typecheck`, `depcheck`, `grep-gates`, `unit-tests`, `web-tests`, `tenant-leak-gate`, `compose-smoke`, `e2e`, `codeql`, `gitleaks`, `bun-audit`, `dockerfile-lint`
- Require branches to be up to date before merging
- Require linear history
- Block force pushes
- Block deletions
- Allow auto-merge (required for `auto-merge.yml`)
- No bypass for admins (review at first incident if too strict)

## 9. Compose split

### `docker-compose.yml` (production)

```yaml
services:
  db: # postgres:17-alpine
  migrator: # one-shot
  api: # bun service
  web: # next.js
  worker: # pg-boss

volumes:
  budget_db_data:
```

### `docker-compose.override.yml` (auto-merged for local dev)

```yaml
services:
  mailpit:
    image: axllent/mailpit:latest
    ports: ["1025:1025", "8025:8025"]
    restart: unless-stopped
  api:
    environment:
      SMTP_HOST: mailpit
      SMTP_PORT: 1025
    depends_on:
      mailpit:
        condition: service_started
  worker:
    environment:
      SMTP_HOST: mailpit
      SMTP_PORT: 1025
```

Local `make dev` continues to work unchanged because `docker compose up` auto-merges `override.yml`. CI uses `docker compose -f docker-compose.yml up` (override excluded) so that `compose-smoke` validates the prod-only definition.

`docker-compose.override.yml.example` is removed; its content moves into the actual `override.yml`.

## 10. Pre-existing red bars (must turn green before CI lands)

These exist on `main` today and must be fixed in the same implementation phase, otherwise CI lands red:

| ID  | File                                              | Issue                                                                                                               | Fix                                                                                                             |
| --- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| L-1 | `eslint.config.js:9`                              | `.next/**` ignore does not match nested `apps/web/.next/**`                                                         | Change pattern to `**/.next/**`                                                                                 |
| L-2 | `apps/api/test/routes/workspaces.test.ts:39`      | unused `tenantGuard`                                                                                                | delete the import + binding                                                                                     |
| L-3 | `apps/api/src/routes/auth.ts:11`                  | unused `eslint-disable @typescript-eslint/no-explicit-any`                                                          | remove the directive                                                                                            |
| L-4 | `apps/api/src/routes/settings.ts:88,106`          | two unused `eslint-disable` directives                                                                              | remove both                                                                                                     |
| T-1 | `packages/identity/src/application/sign-up.ts:24` | unknown property `display_currency`                                                                                 | rename to `displayCurrency` (matches Better Auth additionalFields)                                              |
| T-2 | `apps/api/src/boot.ts:39`                         | SMTP `user`/`pass` typed `string \| undefined` against `SmtpEmailSenderConfig` (`exactOptionalPropertyTypes: true`) | narrow with conditional spread or update the port type to allow `undefined`                                     |
| T-3 | repo root                                         | `bunx tsc -p tsconfig.json` fails (no root tsconfig) and CI silences via `\|\| true`                                | drop the silent root typecheck step from CI; the workspace-aware `bun run typecheck` covers it                  |
| V-1 | `apps/web/test/locale-switcher.test.tsx`          | `useRouter` invariant not satisfied (router not mounted)                                                            | `vi.mock("next/navigation", ...)` with stub `useRouter`/`usePathname`                                           |
| E-1 | `tests/e2e/features/auth/auth-guards.feature`     | "Authenticated user on /sign-in is redirected to /workspaces" intermittent fail                                     | investigate redirect implementation; likely missing server-side guard on `/sign-in` route or stale cookie cache |

## 11. Secrets

GitHub Actions repo secrets:

| Secret               | Source                                    | Used by                          |
| -------------------- | ----------------------------------------- | -------------------------------- |
| `DOCKERHUB_USERNAME` | static (`madonzy13claude`)                | `release.yml`                    |
| `DOCKERHUB_TOKEN`    | mirrored from Infisical (manual one-time) | `release.yml`                    |
| `GITHUB_TOKEN`       | auto-provided by Actions                  | every workflow that needs gh API |

`GITHUB_TOKEN` from Infisical is for local CLI use (creating repo, scripting branch protection); not stored in GH Actions.

## 12. Observability

- Each workflow uploads relevant artifacts (Playwright HTML report, Trivy SARIF, SBOM JSON, coverage lcov)
- `tj-actions/changed-files` is **not** used; concurrency cancellation handles freshness
- A `status` badge for `ci.yml` is added to `README.md` post-merge

## 13. Sequencing of implementation

The implementation plan must execute in this order to keep main green at every commit:

1. **Pre-existing fixes** (L-1, L-2, L-3, L-4, T-1, T-2, T-3, V-1, E-1) committed in one or several small atomic PRs to current `master` so the existing CI is green.
2. **Compose split** (move mailpit to `override.yml`) — verified locally with `make dev`.
3. **Branch rename** local `master` → `main` via `git branch -m master main` (no remote yet, so no force-push concern).
4. **Repo creation + first push** in one shot: `gh repo create madonzy13claude/budget --private --source=. --push` after authenticating `gh` with the Infisical-stored `GITHUB_TOKEN`.
5. **Add CI files** (`.github/workflows/ci.yml`, `release.yml`, `auto-merge.yml`, `dependabot.yml`, `CODEOWNERS`) in one PR — the first PR exercises the new pipeline end-to-end.
6. **Mirror DockerHub secret** (`DOCKERHUB_USERNAME`, `DOCKERHUB_TOKEN`) to GitHub repo secrets manually using `gh secret set` (the only step that requires a human hand on the keyboard, since these come from Infisical).
7. **Configure branch protection** via a checked-in `scripts/setup/branch-protection.sh` that calls `gh api`.
8. **Cut first tag** `v0.1.0-rc.1` to validate `release.yml` end-to-end without claiming `:latest`.
9. **Cut first GA tag** `v0.1.0` once the `rc` flow is verified.

## 14. Acceptance criteria

- A new PR opens against `main`. CI runs all 13 jobs in parallel where possible, completes within 15 minutes, and blocks merge if any fail.
- `git push origin v0.1.0-rc.1` triggers `release.yml`. Within 20 minutes: 4 images in DockerHub tagged `0.1.0-rc.1` and `sha-<git-sha>`; no `latest` tag; GH prerelease published.
- `git push origin v0.1.0` triggers `release.yml`. Within 20 minutes: 4 images tagged `0.1.0`, `0.1`, `latest`, `sha-<git-sha>`; GH Release published with full changelog.
- A Dependabot PR for a patch bump auto-merges within 1 hour of all checks turning green.
- A Dependabot PR for a major bump posts a comment and stays open pending manual review.
- `docker compose -f docker-compose.yml up` (no override) starts only db, migrator, api, web, worker — no mailpit. `docker compose up` (default) starts everything including mailpit for dev.
- Trivy CRITICAL CVE in any image fails `release.yml` and prevents the image from being published.

## 15. Risks and mitigations

| Risk                                                   | Mitigation                                                                                                                  |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| First push of CI files itself fails CI                 | Land pre-existing fixes first (section 13.1)                                                                                |
| GH-hosted runner Docker daemon flakes                  | Re-run individual jobs; `unit-tests` and `compose-smoke` already use Docker successfully in current CI                      |
| DockerHub rate limits on public pulls during release   | Authenticate even pulls via `docker/login-action`; budget images use `oven/bun` and `postgres` base images cached in GHA    |
| Trivy noise from upstream base images                  | Pin base image versions in Dockerfiles; suppress fixed-not-yet CVEs via `.trivyignore` (only with documented justification) |
| Auto-merge merges a green-CI but bug-introducing patch | Tradeoff accepted: this is the price of patch+minor automation; weekly dependency updates keep blast radius small           |
| Bun lockfile drift across `apps` workspaces            | `bun install --frozen-lockfile` enforced everywhere                                                                         |

## 16. Open questions

None blocking. The following are deferred:

- Multi-arch images (arm64) — defer until concrete request
- Image signing (cosign keyless OIDC) — defer until org-level supply-chain policy
- Reusable workflows — defer until duplication justifies it
- Hosted-deployment pipeline (Fly.io, Railway, k8s) — out of scope for this spec
