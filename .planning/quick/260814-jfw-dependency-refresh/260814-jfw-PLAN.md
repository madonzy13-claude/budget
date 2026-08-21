---
id: 260814-jfw
slug: dependency-refresh
description: Upgrade every outdated dependency across all 13 workspaces to latest stable
date: 2026-08-14
mode: quick
branch: chore/dependency-refresh
---

# Quick Task 260814-jfw — Dependency refresh to latest stable

## Goal

`bun outdated --filter='*'` reports 37 rows across 13 workspaces. Every one is a **major**
bump held back by a semver range or an exact pin — everything inside the existing ranges is
already current, so the lockfile has no in-range drift. Bring all of them to the `latest`
dist-tag (verified stable, no beta/rc/canary), fix the fallout, and prove it with the full
gate: typecheck + lint + bun test + vitest + next build + docker build + E2E.

## Research findings (context7 MCP not connected this session — used npm dist-tags + upstream changelogs)

| Package | From → To | Breaking change | Impact here |
|---|---|---|---|
| nanoid | 5.1.16 → 6.0.1 | 4× faster; drops Node 18/20 | None — 1 call site, Bun runtime |
| pino | 9.14.0 → 10.3.1 | Node floor only | None — 1 call site, `pino({ level })` |
| motion | 12.43.0 → 13.1.0 | Optional `@emotion/is-prop-valid` removed in favour of explicit `<MotionConfig isValidProp>` | None — we never used it; 2 `motion/react` imports |
| recharts | 3.9.0 → 3.10.1 | exact pin, minor bump | None expected |
| temporal-polyfill | 0.3.2 → 1.0.4 | Default export dropped: `import Temporal from` → `import { Temporal } from`; package files moved to top level | **None** — all 32 imports already use the named form |
| libsodium-wrappers | 0.7.16 → 0.8.4 | Rebased on libsodium 1.0.21 | Watch the Bun ESM `createRequire` workaround in `packages/platform/src/crypto/libsodium-key-store.ts` — `sodium-ready.test.ts` covers it |
| @types/big.js | 6.2.2 → 7.0.0 | Types catch up to big.js 7 | Runtime `big.js` is already `^7.0.1` — this fixes a real skew |
| @types/node | 25.9.5 → 26.2.0 | — | None expected |
| @types/libsodium-wrappers | 0.7.14 → 0.8.2 | Tracks 0.8.x | Pairs with the runtime bump |
| dependency-cruiser | 17.4.3 → 18.2.0 | Drops Node 20 | CI node bump required |
| lint-staged | 15.5.2 → 17.3.0 | Node ≥ 22.22.1, Git ≥ 2.32, `yaml` now optional | Config is `lint-staged.config.js` (JS, not YAML) → safe. CI node bump required |
| @testing-library/jest-dom | 6.10.0 → 7.0.1 | `@testing-library/dom` is now a **required peer**; Node ≥ 22 | Must add `@testing-library/dom` to `apps/web` devDeps + CI node bump |
| fast-check | 3.23.2 → 4.9.0 | Drops many deprecated arbitraries; `record`/`dictionary` include null-prototype by default; dates include invalid by default | We only use `fc.assert`, `fc.integer`, `fc.property`, `fc.record` — none dropped, but null-prototype records may surface in property tests |
| @playwright/test | 1.55.1 → 1.62.1 | exact pin + root `overrides` | Must move pin *and* the three override entries together |
| playwright-bdd | 8.5.1 → 9.2.0 | Strict Cucumber arity checks on step defs; `enrichReporterData` removed; `junit-modern` alias deprecated; Cucumber messages 27→32, gherkin 32→39 | Step definitions must survive strict arity validation |
| next | 16.2.12 → 16.3.1 | exact pin + `overrides` | 16.3.0 previously broke `next build` (that is *why* it is pinned). Try 16.3.1, revert to 16.2.12 if it reproduces |
| typescript | 5.9.3 → 7.0.2 | Native (Go) port | Largest blast radius: `@typescript-eslint` 8.x, `next build`, vitest, drizzle type inference all need re-verification |
| zod | 3.25.76 → 4.4.3 | Full v4 API migration | 33 importing files + `@hono/zod-validator` + better-auth. Contradicts the CLAUDE.md stack table ("Validation \| Zod v3") — table must be updated |

User decisions (asked and answered before planning): bump TypeScript to 7, migrate zod to 4,
try next 16.3.1 and revert if the build breaks.

## Tasks

Each task is one atomic commit so any single bump can be reverted in isolation.

1. **Low-risk runtime + type bumps** — nanoid 6, pino 10, motion 13, recharts 3.10.1,
   temporal-polyfill 1.0.4, libsodium-wrappers 0.8.4, @types/node 26, @types/big.js 7,
   @types/libsodium-wrappers 0.8.2. Regenerate `bun.lock` via `bun install` (never hand-edit).
2. **CI Node floor 20 → 22** — `.github/workflows/ci.yml:129` and `:272`. Required by
   lint-staged 17, dependency-cruiser 18 and jest-dom 7.
3. **Test tooling** — jest-dom 7 (+ add `@testing-library/dom` peer to `apps/web`),
   fast-check 4, lint-staged 17, dependency-cruiser 18.
4. **Playwright stack** — @playwright/test 1.62.1 (pin + all three root overrides) and
   playwright-bdd 9.2.0. Verify step definitions pass strict arity checks.
5. **Next 16.3.1** — bump the exact pin and the `overrides` entry. Run `next build`.
   If it reproduces the 16.3.0 failure, revert to 16.2.12 and record the error.
6. **TypeScript 7.0.2** — bump in root + `apps/web` + `packages/budgeting` +
   `packages/investments`. Run `typecheck` across all workspaces and `lint`; fix fallout.
7. **zod 4.4.3** — migrate all 33 importing files, verify `@hono/zod-validator` and
   better-auth compatibility, update the CLAUDE.md stack table from v3 to v4.
8. **Full verification gate** — `bun run typecheck`, `bun run lint`, `make test`,
   `cd apps/web && bunx vitest run`, `next build`, `docker compose build`, `make test-e2e`,
   `make ci-gate`.

## Constraints

- Never hand-edit `bun.lock` — regenerate with `bun install` and verify with a clean
  `--frozen-lockfile` install (Docker images build with `--frozen-lockfile`).
- Every `latest` target was confirmed against `bun pm view <pkg> dist-tags` — no
  preview/beta/rc/canary versions.
- Web tests run from `apps/web` cwd (`bunx vitest run`), never from repo root.
- No `git push` / PR / merge until explicitly asked.

## Rollback

Each task is its own commit on `chore/dependency-refresh`. Revert the offending commit;
`bun install` regenerates the lockfile against the restored ranges.
