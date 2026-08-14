---
id: 260814-jfw
slug: dependency-refresh
description: Upgrade every outdated dependency across all 13 workspaces to latest stable
date: 2026-08-14
mode: quick
branch: chore/dependency-refresh
status: complete
---

# Summary — Dependency refresh to latest stable

`bun outdated --filter='*'` reported 37 rows across 13 workspaces at the start.
Every one was a **major** held back by a semver range or an exact pin — nothing
inside the existing ranges had drifted. 16 of the 18 distinct packages are now on
their `latest` dist-tag. Two are deliberately held, each for a reason proven by a
failing gate rather than assumed.

context7 MCP was not connected in this session, so version research came from
`bun pm view <pkg> dist-tags` plus upstream changelogs and release pages. Every
target was confirmed to be a stable `latest`, never a beta/rc/canary.

## Shipped

| Package | From → To |
|---|---|
| nanoid | 5.1.16 → 6.0.1 |
| pino | 9.14.0 → 10.3.1 |
| motion | 12.43.0 → 13.1.0 |
| recharts | 3.9.0 → 3.10.1 |
| temporal-polyfill | 0.3.2 → 1.0.4 |
| libsodium-wrappers | 0.7.16 → 0.8.4 |
| zod | 3.25.76 → 4.4.3 |
| @playwright/test (+ playwright, playwright-core overrides) | 1.55.1 → 1.62.1 |
| playwright-bdd | 8.5.1 → 9.2.0 |
| @testing-library/jest-dom | 6.10.0 → 7.0.1 |
| fast-check | 3.23.2 → 4.9.0 |
| lint-staged | 15.5.2 → 17.3.0 |
| dependency-cruiser | 17.4.3 → 18.2.0 |
| @typescript-eslint/{parser,eslint-plugin} | 8.65.0 → 8.67.0 |
| @types/node | 25.9.5 → 26.2.0 |
| @types/big.js | 6.2.2 → 7.0.0 |
| @types/libsodium-wrappers | 0.7.14 → 0.8.2 |
| CI `node-version` | 20 → 22 |

## Held back (with evidence)

**TypeScript stays at 5.9.3.** 7.0.2 was installed and evaluated. All 12
workspaces typecheck under it once the tsconfig is fixed, but `typescript-eslint`
does not merely warn on TS 7 — its parser throws at load
(`Error: typescript-eslint does not support TS 7.0.`), so `bun run lint` exits
non-zero and the lint gate dies, taking `local/no-float-money` with it. The
documented workaround is to run typescript-eslint against the TS 6 API, but
TypeScript 6 exists only as `6.0.0-beta`. Upstream tracking:
typescript-eslint#10940. Revisit when typescript-eslint supports TS >= 7.1.

**Next.js stays at 16.2.12.** 16.3.1 was tried, as agreed. `next build` on the
host succeeds — which is exactly why this keeps looking safe — but the image
build fails collecting page data:

```
TypeError: Expected CommonJS module to have a function wrapper.
  If you weren't messing around with Bun's internals, this is a bug in Bun
> Build error occurred
Error: Failed to collect page data for /icon.svg
```

Isolated by elimination: with every other upgrade in this branch applied and
**only** Next moved back to 16.2.12, `docker compose build web` exits 0. Building
web on `main` also exits 0. Next 16.3.1 is the sole trigger.

## Defects the upgrades exposed

1. **playwright-bdd 9's strict Cucumber arity check** caught a step definition
   that captured an argument it never accepted — `the reserves golden fixture is
   seeded for {string}` silently discarded the budget name. Signature fixed.
2. **`packages/budgeting` had no `typecheck` script**, so ~27 type errors in its
   test files were invisible to CI (`bun run typecheck` is a CI gate at
   `.github/workflows/ci.yml:52`). Script added, all 27 fixed: mocks that had
   drifted from `ReservePositionsResult.openMonth`, `ReservePosition.reserveExcluded`,
   `CategoryWindow.is_investment`, `SpendingsCategoryLike.isInvestment`, a
   `possessionsValueCents` stub for a port member deleted when possessions became
   wallets, a missing `TaskRepo.emitIncomeUnderPlanned`, un-narrowed neverthrow
   `Result`s, and `fetch` stubs missing Bun's `preconnect`.
3. **`@testing-library/dom` was an undeclared dependency**, resolved by accident
   through `@testing-library/react`. jest-dom 7 makes it a required peer; now
   declared explicitly in `apps/web`.
4. **`@types/big.js` was a major behind its runtime** — `big.js` has been `^7.0.1`
   while the types sat at 6.2.2.

## Verification

| Gate | Result |
|---|---|
| `bun run typecheck` | green, all 12 workspaces |
| `bun run lint` | exit 0 |
| `bun run depcheck` | no violations (1687 modules, 4656 dependencies) |
| backend `bun test` | 946 pass / 208 fail / 1154 — **bit-identical to a same-command `main` baseline**; the 208 are pre-existing make-test debt |
| Vitest (`apps/web`) | 233 files, 2264 tests passed, 34 skipped |
| `next build` | 17 routes compile |
| `bun install --frozen-lockfile` (clean clone) | exit 0 — Docker builds resolve |
| `make dev-build` | api, web, worker, migrator all built and healthy |
| `make test-e2e` | see below |
| `make ci-gate` | see below |

Every failure count was compared against a `main` baseline run of the *same*
command before being called pre-existing. No regression was accepted on the
grounds that it "looked unrelated".

## Notes for next time

- A green host-side `next build` does **not** clear a Next upgrade in this repo.
  Gate Next bumps on `make build-web`.
- `bun.lock` was regenerated with `bun install` at every step and never
  hand-edited; the clean-clone `--frozen-lockfile` install is the proof.
