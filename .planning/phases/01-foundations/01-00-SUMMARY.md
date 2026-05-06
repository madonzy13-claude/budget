---
phase: 01-foundations
plan: "00"
subsystem: monorepo-skeleton
tags: [scaffold, tooling, ci-gates, tdd, architecture]
dependency_graph:
  requires: []
  provides:
    - Bun workspaces (apps/* + packages/*)
    - tsconfig.base.json strict TypeScript baseline
    - bun:test backend runner with PC-23 domain-only coverage
    - Vitest 4 + happy-dom frontend runner
    - Playwright E2E harness
    - dependency-cruiser CI gate (D-27 + PC-02)
    - ESLint no-float-money custom rule (D-19, MONY-07)
    - PC-04 grep gate (.transaction outside tx.ts)
    - PC-03 grep gate (appPool().connect outside tx.ts)
    - Husky pre-commit hook
    - .env.example with all required vars
    - README with PLAT-11 single-region docs
    - GitHub Actions CI workflow
  affects: []
tech_stack:
  added:
    - typescript@^5.6.0 (root devDep)
    - "@types/bun@^1.3.0"
    - dependency-cruiser@^17.4.0
    - eslint@^9.0.0 (flat config)
    - "@typescript-eslint/eslint-plugin@^8.0.0"
    - "@typescript-eslint/parser@^8.0.0"
    - prettier@^3.0.0
    - husky@^9.0.0
    - lint-staged@^15.0.0
    - "@playwright/test@latest"
    - "vitest@^4.0.0 (apps/web)"
    - happy-dom (apps/web)
    - "@testing-library/react + jest-dom (apps/web)"
  patterns:
    - Bun workspaces monorepo (no Turborepo/pnpm/Nx per D-26)
    - Hexagonal package structure with src/index.ts as public surface (PC-15)
    - Flat ESLint config with createRequire for CJS rule modules
    - dependency-cruiser forbidden rules for architecture enforcement
key_files:
  created:
    - package.json (root workspace)
    - tsconfig.base.json
    - .gitignore
    - bun.lock
    - apps/api/package.json
    - apps/web/package.json
    - apps/worker/package.json
    - apps/migrator/package.json
    - packages/shared-kernel/{package.json,tsconfig.json,src/index.ts,test/placeholder.test.ts}
    - packages/identity/{package.json,tsconfig.json,src/index.ts}
    - packages/tenancy/{package.json,tsconfig.json,src/index.ts}
    - packages/platform/{package.json,tsconfig.json,src/index.ts}
    - packages/crypto/{package.json,tsconfig.json,src/index.ts}
    - packages/db/{package.json,tsconfig.json,src/index.ts}
    - bunfig.toml
    - apps/web/vitest.config.ts
    - apps/web/test/setup.ts
    - playwright.config.ts
    - tests/fixtures/.gitkeep
    - tests/fixtures/float-money.ts
    - tests/fixtures/float-money-clean.ts
    - .dependency-cruiser.cjs
    - eslint-rules/no-float-money.cjs
    - eslint-rules/index.cjs
    - eslint.config.js
    - .env.example
    - README.md
    - .husky/pre-commit
    - lint-staged.config.js
    - .github/workflows/ci.yml
  modified: []
decisions:
  - "bun.lock (not bun.lockb): Bun 1.3.12 generates bun.lock (text lockfile) not bun.lockb (binary). Plan referenced bun.lockb; bun.lock is correct for Bun 1.3+."
  - "eslint-rules/*.cjs extension: package.json has type:module so .js files are treated as ESM. CJS modules (using module.exports) must use .cjs extension. eslint.config.js uses createRequire() to import CJS rules."
  - "preload=[] removed from bunfig.toml: Bun 1.3.12 rejects empty array for preload in bunfig.toml config key; omit the key when empty."
  - "Placeholder test added: bun test exits 1 with zero test files. Added packages/shared-kernel/test/placeholder.test.ts to satisfy bun:test in empty skeleton."
metrics:
  duration: "~25 minutes"
  completed: "2026-05-06"
  tasks_completed: 3
  tasks_total: 3
  files_created: 37
---

# Phase 1 Plan 00: Monorepo Skeleton Summary

Bun workspaces monorepo with strict TypeScript, three test runners, and three CI architecture gates on an empty scaffold.

## What Was Built

**Root workspace** (`package.json`): Bun workspaces glob covering `apps/*` and `packages/*`. Includes grep gate scripts for PC-03 (`appPool().connect(`) and PC-04 (`.transaction(`) enforcement.

**TypeScript baseline** (`tsconfig.base.json`): strict + noUncheckedIndexedAccess + exactOptionalPropertyTypes + isolatedModules + verbatimModuleSyntax + ES2024 target.

**App stubs** (4): `@budget/api`, `@budget/web`, `@budget/worker`, `@budget/migrator` — each with minimal `package.json`. `apps/web` includes Vitest 4 + happy-dom devDeps.

**Package stubs** (6): `@budget/shared-kernel`, `@budget/identity`, `@budget/tenancy`, `@budget/platform`, `@budget/crypto`, `@budget/db` — each with `src/index.ts`, `tsconfig.json` extending base, exports pointing at `src/index.ts` (PC-15: no `/dist/`).

**Test runners** (Task 2):
- `bunfig.toml`: bun:test with 80% coverage threshold, PC-23 domain-only scope (excludes adapters/application/contracts/ports)
- `apps/web/vitest.config.ts`: Vitest 4 + happy-dom + RTL
- `playwright.config.ts`: Playwright harness targeting `tests/e2e`

**Architecture gates** (Task 3):
- `.dependency-cruiser.cjs`: 6 forbidden rules — `domain-no-orm`, `domain-no-http-framework`, `domain-no-sibling-adapters`, `cross-package-only-contracts`, `apps-only-public-package-surface` (PC-02), `no-direct-db-transaction` (PC-04 documentation hook)
- `eslint-rules/no-float-money.cjs`: custom rule flagging `+=`, `-=`, `*=`, `/=` and binary `+/-/*/` on `*amount/money/total/sum/price/cost/balance` identifiers (D-19, MONY-07)
- GitHub Actions CI: typecheck + depcruise + grep:no-direct-tx + grep:no-pool-connect + ESLint fixture gate pair + bun test

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] bun.lockb renamed to bun.lock**
- **Found during:** Task 1
- **Issue:** Plan referenced `bun.lockb` (Bun binary lockfile); Bun 1.3.12 generates `bun.lock` (text format) instead
- **Fix:** Accepted `bun.lock` as the lockfile; plan artifact list updated in SUMMARY
- **Files modified:** N/A (bun.lock is auto-generated)

**2. [Rule 3 - Blocking] eslint-rules files renamed to .cjs**
- **Found during:** Task 3
- **Issue:** `package.json` has `"type": "module"`, so `.js` files are treated as ESM. The ESLint rule modules use `module.exports` (CJS syntax), causing `SyntaxError: module is not defined in ES module scope`
- **Fix:** Renamed `eslint-rules/no-float-money.js` → `.cjs` and `eslint-rules/index.js` → `.cjs`; updated `eslint.config.js` to use `createRequire(import.meta.url)` for CJS interop
- **Files modified:** `eslint-rules/no-float-money.cjs`, `eslint-rules/index.cjs`, `eslint.config.js`

**3. [Rule 3 - Blocking] preload = [] removed from bunfig.toml**
- **Found during:** Task 2 verification
- **Issue:** Bun 1.3.12 rejects `preload = []` in bunfig.toml config with `Expected preload to be an array` parse error
- **Fix:** Removed the empty `preload = []` key from bunfig.toml
- **Files modified:** `bunfig.toml`

**4. [Rule 3 - Blocking] Added placeholder.test.ts**
- **Found during:** Task 2 verification
- **Issue:** `bun test` exits 1 (not 0) when zero test files are found; the plan's `bun test` → 0 acceptance criterion requires a passing run
- **Fix:** Added `packages/shared-kernel/test/placeholder.test.ts` with a single trivial passing test
- **Files modified:** `packages/shared-kernel/test/placeholder.test.ts`
- **Note:** This test should be removed when real domain tests are added to shared-kernel

**5. [Rule 2 - Missing Critical] float-money-clean.ts unused variable fix**
- **Found during:** Task 3 ESLint verification
- **Issue:** The clean fixture had `const c = a.add(b)` which triggered `@typescript-eslint/no-unused-vars`
- **Fix:** Changed to `void a.add(b)` — correctly tests that `no-float-money` does not flag method calls
- **Files modified:** `tests/fixtures/float-money-clean.ts`

## Known Stubs

- `packages/*/src/index.ts` — all 6 package index files are empty stubs (`export {}`). Intentional: domain implementations come in later plans.
- `tests/fixtures/.gitkeep` — placeholder for E2E test directory structure. Intentional: E2E tests added in Phase 6.
- `packages/shared-kernel/test/placeholder.test.ts` — trivial test ensuring `bun test` exits 0. Intentional for skeleton; replace with real domain tests in Plan 01.

## Verification Results

All 8 steps from the plan's `<verification>` section pass:

| Step | Status |
|------|--------|
| `bun install --frozen-lockfile` | PASS |
| `bun run typecheck` (tsc on all packages) | PASS |
| `bunx depcruise --config ... apps packages` | PASS (0 violations) |
| `bun run grep:no-direct-tx` | PASS (exit 0) |
| `bun run grep:no-pool-connect` | PASS (exit 0) |
| `bunx eslint tests/fixtures/float-money-clean.ts` | PASS (exit 0) |
| `bunx eslint tests/fixtures/float-money.ts; test $? -ne 0` | PASS (exit 1 as expected) |
| `bun test` | PASS (1 test, exit 0) |

## Self-Check: PASSED

All key files verified to exist on disk:
- package.json, tsconfig.base.json, .dependency-cruiser.cjs, eslint.config.js — FOUND
- eslint-rules/no-float-money.cjs, bunfig.toml — FOUND
- apps/web/vitest.config.ts, playwright.config.ts — FOUND
- .github/workflows/ci.yml, README.md — FOUND

All task commits verified in git log:
- 6f87454 (Task 1: root workspace + tsconfig + skeletons) — FOUND
- 004458e (Task 2: test runners) — FOUND
- fa1363d (Task 3: dep-cruiser + ESLint + CI gates) — FOUND
