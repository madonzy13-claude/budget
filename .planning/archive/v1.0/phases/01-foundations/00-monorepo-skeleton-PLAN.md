---
phase: 01-foundations
plan: 00
plan_id: 01.00
type: execute
wave: 0
depends_on: []
files_modified:
  - package.json
  - bun.lockb
  - tsconfig.base.json
  - .dependency-cruiser.cjs
  - eslint.config.js
  - eslint-rules/no-float-money.js
  - tests/fixtures/float-money.ts
  - bunfig.toml
  - apps/web/vitest.config.ts
  - apps/web/test/setup.ts
  - playwright.config.ts
  - .env.example
  - .gitignore
  - apps/api/package.json
  - apps/web/package.json
  - apps/worker/package.json
  - apps/migrator/package.json
  - packages/shared-kernel/package.json
  - packages/shared-kernel/tsconfig.json
  - packages/identity/package.json
  - packages/identity/tsconfig.json
  - packages/tenancy/package.json
  - packages/tenancy/tsconfig.json
  - packages/platform/package.json
  - packages/platform/tsconfig.json
  - packages/crypto/package.json
  - packages/crypto/tsconfig.json
  - packages/db/package.json
  - packages/db/tsconfig.json
  - .husky/pre-commit
  - lint-staged.config.js
  - README.md
  - .github/workflows/ci.yml
autonomous: true
requirements: [ENGR-01, ENGR-02, ENGR-03, ENGR-04, ENGR-10, MONY-07, PLAT-11]
must_haves:
  truths:
    - "bun install completes against the root workspace declaration"
    - "bunx depcruise blocks domain → drizzle-orm/hono/adapters imports"
    - "bunx depcruise BANS apps/** importing packages/*/src/{domain,application,adapters,ports}/** (PC-02, PC-15)"
    - "bunx depcruise ALLOWS apps/** importing packages/*/src/index.ts AND packages/*/src/contracts/** (PC-02, PC-15, D-27 carve-out)"
    - "ESLint no-float-money rule flags float arithmetic on Money identifiers"
    - "bun:test backend runner reads bunfig.toml [test] section"
    - "Vitest runs apps/web in happy-dom environment"
    - "Playwright config compiles without errors"
    - "Zod env schema fails-fast on missing required vars"
    - "CI grep step blocks ANY .transaction( call outside packages/platform/src/db/tx.ts repo-wide (PC-04, PC-26 — file-level exclude on tx.ts; --exclude-dir=test for PC-28 testcontainer carve-out)"
    - "CI grep step blocks ANY appPool().connect( call outside packages/platform/src/db/tx.ts repo-wide (PC-03, PC-26 — file-level exclude on tx.ts; --exclude-dir=test for PC-28 testcontainer carve-out). PC-27: legitimate bootstrap reads use withBootstrapUserContext primitive (Plan 02 Task 2)"
    - "Husky + lint-staged pre-commit hook is executable"
    - "README.md documents single-region v1 deployment (PLAT-11)"
    - "tsconfig.base.json strict mode covers all workspace packages"
    - "Package package.json exports: main → src/index.ts (no /dist/) — Bun runs TS natively (PC-15)"
    - "PC-23: bunfig.toml coveragePathIgnorePatterns excludes test/, apps/, packages/*/src/{adapters,application,contracts,ports}/ — domain-only 80% threshold"
  artifacts:
    - path: package.json
      provides: "Root Bun workspaces declaration"
      contains: "workspaces"
    - path: tsconfig.base.json
      provides: "Strict TS settings shared by all packages"
      contains: '"strict": true'
    - path: .dependency-cruiser.cjs
      provides: "Forbidden-rules CI gate per D-27 / ENGR-10 + PC-02 apps/packages boundary"
      contains: "domain-no-orm"
    - path: eslint.config.js
      provides: "Flat-config ESLint with no-float-money rule"
      contains: "no-float-money"
    - path: eslint-rules/no-float-money.js
      provides: "Custom ESLint rule banning float arithmetic on Money"
      contains: "module.exports"
    - path: bunfig.toml
      provides: "bun:test config + coverage thresholds (PC-23 domain-only scope)"
      contains: "[test]"
    - path: apps/web/vitest.config.ts
      provides: "Vitest 4 + happy-dom + RTL preset"
      contains: "happy-dom"
    - path: playwright.config.ts
      provides: "Playwright harness (Phase 6 fills E2E)"
      contains: "defineConfig"
    - path: .env.example
      provides: "Enumerates DATABASE_URL_*, BUDGET_KEK, BETTER_AUTH_*, REGION"
      contains: "BUDGET_KEK="
    - path: .github/workflows/ci.yml
      provides: "CI runs depcruise + grep gates (PC-03, PC-04) + bun test"
      contains: "depcruise"
  key_links:
    - from: "package.json (root)"
      to: "apps/* + packages/*"
      via: "Bun workspaces glob"
      pattern: 'workspaces.*apps/\*.*packages/\*'
    - from: ".dependency-cruiser.cjs"
      to: "all packages/*/src/domain"
      via: "from.path regex"
      pattern: "packages.*src/domain"
    - from: "eslint.config.js"
      to: "eslint-rules/no-float-money.js"
      via: "rules section"
      pattern: "no-float-money"
---

<objective>
Establish the monorepo skeleton, test rails, and CI gates that every later plan depends on.

Purpose: Wave 0 is the blocking foundation per RESEARCH §Suggested Plan Decomposition. No code in Waves 1-3 can run without these scaffolds. This plan implements D-26 (Bun workspaces), D-27 (dependency-cruiser) + PC-02 carve-out (apps/_ may import packages/_/src/index.ts + contracts/\*\* only), D-28 (test runners), the ESLint `no-float-money` rule (D-19/MONY-07), the PC-04 grep gate (`.transaction(` only inside `packages/platform/src/db/tx.ts`), the PC-03 grep gate (`appPool().connect(` only inside `packages/platform/src/db/tx.ts`), and the PC-23 narrowed coverage scope (domain-only 80%). Per PC-26 the grep gates use file-level `--exclude=tx.ts` (the canonical location is `packages/platform/src/db/tx.ts`); per PC-28 they additionally `--exclude-dir=test` so the testcontainer helper and other test-only call sites are not flagged.

Output: A monorepo where `bun install`, `bun test`, `bunx depcruise`, and `bunx eslint` all run cleanly against empty-but-valid scaffolds.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/ROADMAP.md
@.planning/REQUIREMENTS.md
@.planning/phases/01-foundations/01-CONTEXT.md
@.planning/phases/01-foundations/01-RESEARCH.md
@.planning/phases/01-foundations/01-VALIDATION.md
@CLAUDE.md

<interfaces>
<!-- Wave 0 ships scaffolds only; later plans consume these via the file paths above. -->
<!-- Bun workspaces glob -->
package.json:
  "workspaces": ["apps/*", "packages/*"]

<!-- Per-package package.json shape (each app/package mirrors this) — PC-15: NO /dist/, Bun runs TS natively -->

{
"name": "@budget/<name>",
"version": "0.0.0",
"private": true,
"type": "module",
"main": "src/index.ts",
"exports": { ".": "./src/index.ts" },
"scripts": { "test": "bun test", "typecheck": "tsc --noEmit" }
}

<!-- tsconfig.base.json (extends in every package) -->

{
"compilerOptions": {
"target": "ES2024",
"module": "ESNext",
"moduleResolution": "bundler",
"strict": true,
"noUncheckedIndexedAccess": true,
"exactOptionalPropertyTypes": true,
"esModuleInterop": true,
"skipLibCheck": true,
"isolatedModules": true,
"verbatimModuleSyntax": true,
"lib": ["ES2024"]
}
}
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Root workspace + tsconfig + per-package skeletons</name>
  <files>
    package.json,
    bun.lockb,
    tsconfig.base.json,
    .gitignore,
    apps/api/package.json,
    apps/web/package.json,
    apps/worker/package.json,
    apps/migrator/package.json,
    packages/shared-kernel/package.json,
    packages/shared-kernel/tsconfig.json,
    packages/identity/package.json,
    packages/identity/tsconfig.json,
    packages/tenancy/package.json,
    packages/tenancy/tsconfig.json,
    packages/platform/package.json,
    packages/platform/tsconfig.json,
    packages/crypto/package.json,
    packages/crypto/tsconfig.json,
    packages/db/package.json,
    packages/db/tsconfig.json
  </files>
  <read_first>
    - CLAUDE.md (Tech stack lockfile — version pins for typescript, bun)
    - .planning/phases/01-foundations/01-RESEARCH.md §"Standard Stack" + §"Recommended Project Structure" + D-26
    - .planning/phases/01-foundations/01-CONTEXT.md D-26 (Bun workspaces, no Turborepo/pnpm/Nx)
  </read_first>
  <behavior>
    - bun install (with empty src/) succeeds with zero ERR
    - bunx tsc --noEmit -p packages/shared-kernel succeeds (empty index.ts)
    - All workspace packages resolve as @budget/<name> via Bun workspaces
    - tsconfig.base.json sets strict + noUncheckedIndexedAccess + exactOptionalPropertyTypes
    - Each package.json exports `"."` → `"./src/index.ts"` (PC-15: NO /dist/, Bun runs TS natively)
  </behavior>
  <action>
    1. Create root `package.json` with:
       ```json
       {
         "name": "budget",
         "version": "0.0.0",
         "private": true,
         "type": "module",
         "workspaces": ["apps/*", "packages/*"],
         "scripts": {
           "test": "bun test",
           "typecheck": "bun run --filter='*' typecheck",
           "lint": "eslint .",
           "depcheck": "depcruise --config .dependency-cruiser.cjs apps packages",
           "grep:no-direct-tx": "! grep -RnE '\\.transaction\\(' --include='*.ts' --exclude=tx.ts --exclude-dir=test apps packages",
           "grep:no-pool-connect": "! grep -RnE 'appPool\\(\\)\\.connect\\(' --include='*.ts' --exclude=tx.ts --exclude-dir=test packages apps"
         },
         "devDependencies": {
           "typescript": "^5.6.0",
           "@types/bun": "^1.3.0",
           "dependency-cruiser": "^17.4.0",
           "eslint": "^9.0.0",
           "@typescript-eslint/eslint-plugin": "^8.0.0",
           "@typescript-eslint/parser": "^8.0.0",
           "prettier": "^3.0.0",
           "husky": "^9.0.0",
           "lint-staged": "^15.0.0"
         },
         "engines": { "bun": ">=1.3.0" }
       }
       ```
       PC-26: the `grep:no-direct-tx` and `grep:no-pool-connect` gates use file-level `--exclude=tx.ts` (canonical location `packages/platform/src/db/tx.ts`). PC-28: both gates additionally `--exclude-dir=test` so the testcontainer helper (`packages/db/test/testcontainer.ts`) and other test-only call sites are whitelisted. Outside test directories there is exactly one approved call site (the `tx.ts` file itself).
    2. Create `tsconfig.base.json` with the exact contents shown in `<interfaces>` (strict + ES2024 + bundler + exactOptionalPropertyTypes + isolatedModules + verbatimModuleSyntax).
    3. Create `.gitignore` with: `node_modules/`, `.next/`, `dist/`, `coverage/`, `bun.lockb` (keep), `.env`, `*.log`, `.turbo/`, `playwright-report/`, `test-results/`.
    4. For each app (`apps/api`, `apps/web`, `apps/worker`, `apps/migrator`) create `package.json`:
       ```json
       {
         "name": "@budget/<name>",
         "version": "0.0.0",
         "private": true,
         "type": "module",
         "scripts": {
           "test": "bun test",
           "typecheck": "tsc --noEmit -p tsconfig.json"
         }
       }
       ```
       — `apps/web` uses `"scripts": { "test": "vitest run", "typecheck": "tsc --noEmit -p tsconfig.json", "dev": "next dev", "build": "next build", "start": "next start" }`.
    5. For each package (`packages/shared-kernel`, `packages/identity`, `packages/tenancy`, `packages/platform`, `packages/crypto`, `packages/db`) create:
       - `package.json` with `"name": "@budget/<name>"`, `"main": "src/index.ts"`, `"exports": { ".": "./src/index.ts" }` (PC-15: no /dist/).
       - `tsconfig.json` extending `../../tsconfig.base.json` with `"include": ["src/**/*", "test/**/*"]`.
       - `src/index.ts` empty placeholder file.
    6. Run `bun install` to generate `bun.lockb` and confirm workspaces resolve.
  </action>
  <verify>
    <automated>bun install --frozen-lockfile && bunx tsc --noEmit -p packages/shared-kernel/tsconfig.json && bunx tsc --noEmit -p packages/identity/tsconfig.json && bunx tsc --noEmit -p packages/tenancy/tsconfig.json && bunx tsc --noEmit -p packages/platform/tsconfig.json</automated>
  </verify>
  <acceptance_criteria>
    - File `package.json` contains exact glob `"apps/*"` AND `"packages/*"`: `grep -E 'apps/\*' package.json && grep -E 'packages/\*' package.json` exits 0
    - File `tsconfig.base.json` contains `"strict": true` AND `"noUncheckedIndexedAccess": true`: `grep -F '"strict": true' tsconfig.base.json && grep -F '"noUncheckedIndexedAccess": true' tsconfig.base.json` exits 0
    - All 4 app `package.json` files exist: `for d in apps/{api,web,worker,migrator}; do test -f $d/package.json; done` exits 0
    - All 6 package `package.json` files exist with name `@budget/...`: `for d in packages/{shared-kernel,identity,tenancy,platform,crypto,db}; do grep -F '"name": "@budget/' $d/package.json; done` exits 0
    - PC-15: every package package.json exports src/index.ts (no /dist/): `for d in packages/{shared-kernel,identity,tenancy,platform,crypto,db}; do grep -F '"./src/index.ts"' $d/package.json && ! grep -F '/dist/' $d/package.json; done` exits 0
    - `bun install` succeeds (no errors); `bun.lockb` exists
    - `bunx tsc --noEmit -p packages/shared-kernel/tsconfig.json` exits 0 against empty index.ts
  </acceptance_criteria>
  <done>Root + apps + packages skeleton compiles via tsc; bun install resolves all workspaces; strict TypeScript settings enforced; PC-15 package exports point at src/index.ts only.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Test runners — bunfig.toml + Vitest + Playwright + coverage gate (PC-23 domain-only)</name>
  <files>
    bunfig.toml,
    apps/web/vitest.config.ts,
    apps/web/test/setup.ts,
    playwright.config.ts,
    tests/fixtures/.gitkeep
  </files>
  <read_first>
    - .planning/phases/01-foundations/01-VALIDATION.md (Test Infrastructure table + Wave 0 requirements)
    - .planning/phases/01-foundations/01-RESEARCH.md §"Test Stack" + §"Validation Architecture"
    - CLAUDE.md (test stack picks: bun:test backend, Vitest 4 frontend, Playwright E2E)
  </read_first>
  <behavior>
    - `bun test` runs and reports 0 tests (no test files yet) without error
    - `bun test --coverage --coverage-threshold-line=80` accepts the threshold flag (CI gate ENGR-02)
    - PC-23: coveragePathIgnorePatterns narrows the 80% threshold to domain code only (excludes test/, apps/, packages/*/src/{adapters,application,contracts,ports})
    - `bunx vitest --version` runs from `apps/web` after install (lazy-installed via apps/web devDeps)
    - `bunx playwright --version` runs from root
  </behavior>
  <action>
    1. Create `bunfig.toml` at root:
       ```toml
       [install]
       registry = "https://registry.npmjs.org/"

       [test]
       coverage = true
       coverageThreshold = 0.80
       # PC-23: narrow 80% threshold to domain code only — adapter/application/contract/port layers
       # are integration-tested separately and are not the locus of business invariants.
       coveragePathIgnorePatterns = [
         "test/",
         "node_modules/",
         "dist/",
         "apps/",
         "packages/*/src/adapters/",
         "packages/*/src/application/",
         "packages/*/src/contracts/",
         "packages/*/src/ports/"
       ]
       coverageReporter = ["text", "lcov"]
       preload = []
       ```
    2. Add `vitest@^4`, `happy-dom@latest`, `@testing-library/react@latest`, `@testing-library/jest-dom@latest` to `apps/web/package.json` devDependencies.
    3. Create `apps/web/vitest.config.ts`:
       ```ts
       import { defineConfig } from 'vitest/config';
       export default defineConfig({
         test: {
           environment: 'happy-dom',
           globals: true,
           setupFiles: ['./test/setup.ts'],
           include: ['**/*.test.{ts,tsx}'],
         },
       });
       ```
    4. Create `apps/web/test/setup.ts`:
       ```ts
       import '@testing-library/jest-dom/vitest';
       ```
    5. Add `playwright@latest` to root devDependencies. Create `playwright.config.ts`:
       ```ts
       import { defineConfig } from '@playwright/test';
       export default defineConfig({
         testDir: './tests/e2e',
         timeout: 30000,
         use: { baseURL: 'http://localhost:3000', trace: 'on-first-retry' },
         reporter: [['html', { outputFolder: 'playwright-report' }]],
       });
       ```
    6. Create empty `tests/fixtures/.gitkeep` so the directory exists for the ESLint rule fixture in Task 3.
    7. Run `bun install`. Confirm `bun test` (no test files) reports 0 tests successfully.

  </action>
  <verify>
    <automated>bun install --frozen-lockfile && bun test 2>&1 | grep -E '(0 pass|tests:|0 tests)' && test -f apps/web/vitest.config.ts && test -f playwright.config.ts</automated>
  </verify>
  <acceptance_criteria>
    - `bunfig.toml` exists and contains `[test]` section: `grep -F '[test]' bunfig.toml` exits 0
    - `bunfig.toml` declares coverageThreshold ≥ 0.80: `grep -E 'coverageThreshold = 0\.[89]|1\.0' bunfig.toml` exits 0
    - PC-23: bunfig.toml ignore patterns include adapter/application/contract/port: `for p in adapters application contracts ports; do grep -F "packages/*/src/${p}/" bunfig.toml; done` exits 0
    - PC-23: bunfig.toml ignore patterns include apps/: `grep -F '"apps/"' bunfig.toml` exits 0
    - `apps/web/vitest.config.ts` declares happy-dom: `grep -F "happy-dom" apps/web/vitest.config.ts` exits 0
    - `playwright.config.ts` exists with defineConfig: `grep -F 'defineConfig' playwright.config.ts` exits 0
    - `bun test` exits 0 (zero tests is success)
  </acceptance_criteria>
  <done>All three runners present and bootable. Coverage threshold gate set to 80% domain-only (PC-23) for ENGR-02. tests/ directories ready.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: dependency-cruiser + ESLint flat-config + custom no-float-money rule + grep CI gates (PC-03, PC-04)</name>
  <files>
    .dependency-cruiser.cjs,
    eslint.config.js,
    eslint-rules/no-float-money.js,
    eslint-rules/index.js,
    tests/fixtures/float-money.ts,
    tests/fixtures/float-money-clean.ts,
    .github/workflows/ci.yml,
    .husky/pre-commit,
    lint-staged.config.js,
    .env.example,
    README.md
  </files>
  <read_first>
    - .planning/phases/01-foundations/01-RESEARCH.md §"Pattern 5" (full dep-cruiser config) + §"Pattern 8" (Money + ESLint rule rationale) + §"Common Pitfalls" Pitfall 6
    - .planning/phases/01-foundations/01-VALIDATION.md (Wave 0 Requirements checklist + grep gate command)
    - .planning/phases/01-foundations/01-CONTEXT.md D-09 (withTenantTx is the only tx primitive), D-27 (dep-cruiser rules)
  </read_first>
  <behavior>
    - dep-cruiser flags: domain importing drizzle-orm, hono, ai, @ai-sdk/*, sibling adapters
    - dep-cruiser passes against empty packages/* (no violations on empty src/index.ts)
    - PC-02: dep-cruiser BANS apps/** importing packages/*/src/{domain,application,adapters,ports}/**
    - PC-02: dep-cruiser ALLOWS apps/** importing packages/*/src/index.ts AND packages/*/src/contracts/**
    - ESLint custom rule `no-float-money` flags `total += expense.amount` in fixture
    - ESLint passes on `float-money-clean.ts` fixture (uses Money.add)
    - PC-04 grep gate: blocks `.transaction(` calls outside `packages/platform/src/db/tx.ts` (single repo-wide call site, file-level exclude per PC-26; --exclude-dir=test per PC-28)
    - PC-03 grep gate: blocks `appPool().connect(` calls outside `packages/platform/src/db/tx.ts` (file-level exclude per PC-26; --exclude-dir=test per PC-28). PC-27: tenant-guard middleware uses `withBootstrapUserContext` helper instead of raw client.
    - Husky pre-commit hook is executable and runs lint-staged + both grep gates
    - .env.example enumerates: DATABASE_URL_APP, DATABASE_URL_WORKER, DATABASE_URL_MIGRATOR, BUDGET_KEK, BETTER_AUTH_SECRET, BETTER_AUTH_URL, APP_URL, REGION
    - README.md states single-region v1 (PLAT-11)
  </behavior>
  <action>
    1. Create `.dependency-cruiser.cjs` with rules from RESEARCH §Pattern 5 PLUS PC-02 boundary rules:
       ```js
       /** @type {import('dependency-cruiser').IConfiguration} */
       module.exports = {
         forbidden: [
           {
             name: 'domain-no-orm',
             severity: 'error',
             from: { path: 'packages/.+/src/domain' },
             to:   { path: '^(drizzle-orm|hono|ai|@ai-sdk/.*)' },
           },
           {
             name: 'domain-no-http-framework',
             severity: 'error',
             from: { path: 'packages/.+/src/domain' },
             to:   { path: '^(hono|@hono/.*)' },
           },
           {
             name: 'domain-no-sibling-adapters',
             severity: 'error',
             from: { path: 'packages/(.+)/src/(domain|application|ports)' },
             to:   { path: 'packages/(?!\\1)(.+)/src/(adapters|application)' },
           },
           {
             name: 'cross-package-only-contracts',
             severity: 'error',
             from: { path: 'packages/(.+)/src/(?!contracts)' },
             to:   { path: 'packages/(?!\\1)(.+)/src/(?!(index\\.ts|contracts))' },
           },
           // PC-02: apps/** may import packages/*/src/index.ts AND packages/*/src/contracts/** ONLY.
           // BANS apps/** reaching into domain/application/adapters/ports.
           {
             name: 'apps-only-public-package-surface',
             severity: 'error',
             from: { path: '^apps/' },
             to:   { path: 'packages/[^/]+/src/(domain|application|adapters|ports)' },
           },
           {
             name: 'no-direct-db-transaction',
             severity: 'error',
             from: { pathNot: 'packages/platform/src/db/tx\\.ts$' },
             to:   { path: 'drizzle-orm', dependencyTypes: ['local'] },
             // The grep gate (PC-04) is the load-bearing wall; this dep-cruiser rule provides
             // a documentation hook for IDE/lint tooling.
           },
         ],
         options: {
           tsConfig: { fileName: 'tsconfig.base.json' },
           doNotFollow: { path: 'node_modules' },
         },
       };
       ```
    2. Create `eslint-rules/no-float-money.js` (custom ESLint rule):
       ```js
       /** @type {import('eslint').Rule.RuleModule} */
       module.exports = {
         meta: {
           type: 'problem',
           docs: { description: 'Disallow float arithmetic on Money / .amount identifiers' },
           messages: { floatMath: 'Float arithmetic on Money is forbidden — use Money.add/sub/mul (D-19, MONY-07)' },
         },
         create(context) {
           const isMoneyName = (id) => typeof id === 'string' && /(amount|money|total|sum|price|cost|balance)$/i.test(id);
           const reportIfMoney = (node, name) => {
             if (isMoneyName(name)) context.report({ node, messageId: 'floatMath' });
           };
           return {
             AssignmentExpression(node) {
               if (['+=', '-=', '*=', '/='].includes(node.operator)) {
                 const id = node.left.type === 'Identifier' ? node.left.name
                          : node.left.type === 'MemberExpression' && node.left.property.type === 'Identifier' ? node.left.property.name
                          : null;
                 if (id) reportIfMoney(node, id);
               }
             },
             BinaryExpression(node) {
               if (['+', '-', '*', '/'].includes(node.operator)) {
                 const lid = node.left.type === 'MemberExpression' && node.left.property.type === 'Identifier' ? node.left.property.name : null;
                 const rid = node.right.type === 'MemberExpression' && node.right.property.type === 'Identifier' ? node.right.property.name : null;
                 if (lid) reportIfMoney(node, lid);
                 if (rid) reportIfMoney(node, rid);
               }
             },
           };
         },
       };
       ```
    3. Create `eslint-rules/index.js`:
       ```js
       module.exports = { rules: { 'no-float-money': require('./no-float-money') } };
       ```
    4. Create `eslint.config.js` (flat config):
       ```js
       import tsParser from '@typescript-eslint/parser';
       import tsPlugin from '@typescript-eslint/eslint-plugin';
       import localRules from './eslint-rules/index.js';
       export default [
         { ignores: ['node_modules/**', 'dist/**', '.next/**', 'coverage/**', 'playwright-report/**'] },
         {
           files: ['**/*.ts', '**/*.tsx'],
           languageOptions: { parser: tsParser, parserOptions: { project: false, ecmaVersion: 2024, sourceType: 'module' } },
           plugins: { '@typescript-eslint': tsPlugin, local: localRules },
           rules: {
             'local/no-float-money': 'error',
             '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
           },
         },
       ];
       ```
    5. Create `tests/fixtures/float-money.ts` (POSITIVE — must trigger rule):
       ```ts
       const expense = { amount: 0 };
       let total = 0;
       total += expense.amount;          // BAD — flagged by rule
       const sum = total + expense.amount; // BAD — flagged
       export {};
       ```
    6. Create `tests/fixtures/float-money-clean.ts` (NEGATIVE — must NOT trigger rule):
       ```ts
       // Money.add usage — rule does not flag method calls
       declare const a: { add(b: unknown): unknown };
       declare const b: unknown;
       const c = a.add(b);
       export {};
       ```
    7. Create `.env.example` with EXACT keys:
       ```
       # Postgres role-separated DSNs (D-18)
       DATABASE_URL_APP=postgresql://app_role:app_pw@db:5432/budget
       DATABASE_URL_WORKER=postgresql://worker_role:worker_pw@db:5432/budget
       DATABASE_URL_MIGRATOR=postgresql://migrator:migrator_pw@db:5432/budget

       # Better Auth (D-15)
       BETTER_AUTH_SECRET=change-me-32-chars-min
       BETTER_AUTH_URL=http://localhost:3000
       APP_URL=http://localhost:3000

       # Crypto-shredding KEK (D-16) — 32-byte base64
       BUDGET_KEK=

       # Single region v1 (PLAT-11)
       REGION=eu-central-1

       # Logging
       LOG_LEVEL=info
       ```
    8. Create `README.md` with sections: Project overview, Tech stack lockfile reference (link to CLAUDE.md), Local dev (`docker compose up`), Single-region v1 (PLAT-11) — paragraph stating: "v1 ships single-region (region selection deferred to v1.x per PLAT-11). The `REGION` env var documents the chosen region for ops; multi-region routing is NOT in v1."
    9. Create `.husky/pre-commit` (executable):
       ```sh
       #!/usr/bin/env sh
       . "$(dirname -- "$0")/_/husky.sh"
       bunx lint-staged
       bun run grep:no-direct-tx
       bun run grep:no-pool-connect
       ```
       Run `chmod +x .husky/pre-commit`.
    10. Create `lint-staged.config.js`:
        ```js
        export default {
          '*.{ts,tsx}': ['eslint --fix --max-warnings=0', 'prettier --write'],
          '*.{json,md}': ['prettier --write'],
        };
        ```
    11. Create `.github/workflows/ci.yml`:
        ```yaml
        name: CI
        on: [push, pull_request]
        jobs:
          gate:
            runs-on: ubuntu-latest
            steps:
              - uses: actions/checkout@v4
              - uses: oven-sh/setup-bun@v2
                with: { bun-version: 1.3.x }
              - run: bun install --frozen-lockfile
              - name: typecheck
                run: bun run --filter='*' typecheck
              - name: dependency-cruiser
                run: bunx depcruise --config .dependency-cruiser.cjs --output-type err apps packages
              - name: grep ban .transaction outside packages/platform/src/db/tx.ts (PC-04, PC-26 file-level exclude, PC-28 test exclude)
                run: 'bun run grep:no-direct-tx'
              - name: grep ban appPool().connect outside packages/platform/src/db/tx.ts (PC-03, PC-26 file-level exclude, PC-28 test exclude)
                run: 'bun run grep:no-pool-connect'
              - name: eslint (no-float-money fixture must FAIL)
                run: |
                  if bunx eslint tests/fixtures/float-money.ts; then
                    echo "ERROR: ESLint should have failed on float-money fixture"; exit 1
                  fi
              - name: eslint (clean fixture must PASS)
                run: bunx eslint tests/fixtures/float-money-clean.ts
              - name: bun test
                run: bun test
        ```

  </action>
  <verify>
    <automated>bunx depcruise --config .dependency-cruiser.cjs --output-type err apps packages && bun run grep:no-direct-tx && bun run grep:no-pool-connect && bunx eslint tests/fixtures/float-money-clean.ts && (bunx eslint tests/fixtures/float-money.ts; test $? -ne 0)</automated>
  </verify>
  <acceptance_criteria>
    - `.dependency-cruiser.cjs` declares rule named `domain-no-orm`: `grep -F 'domain-no-orm' .dependency-cruiser.cjs` exits 0
    - `.dependency-cruiser.cjs` declares rule `no-direct-db-transaction`: `grep -F 'no-direct-db-transaction' .dependency-cruiser.cjs` exits 0
    - `.dependency-cruiser.cjs` rule references canonical tx.ts location at packages/platform: `grep -F 'packages/platform/src/db/tx' .dependency-cruiser.cjs` exits 0
    - PC-02 boundary rule declared: `grep -F 'apps-only-public-package-surface' .dependency-cruiser.cjs` exits 0
    - PC-02 boundary rule bans apps/** → domain/application/adapters/ports: `grep -F 'src/(domain|application|adapters|ports)' .dependency-cruiser.cjs` exits 0
    - `eslint-rules/no-float-money.js` exports a Rule.RuleModule: `grep -F 'module.exports' eslint-rules/no-float-money.js` exits 0
    - `eslint.config.js` registers `local/no-float-money` as error: `grep -F "'local/no-float-money': 'error'" eslint.config.js` exits 0
    - `tests/fixtures/float-money.ts` causes `bunx eslint` to exit non-zero (rule fires): `bunx eslint tests/fixtures/float-money.ts; test $? -ne 0` exits 0
    - `tests/fixtures/float-money-clean.ts` passes `bunx eslint`: exits 0
    - PC-04 grep gate exits 0 on empty repo: `bun run grep:no-direct-tx` exits 0
    - PC-26 + PC-04 grep gate uses file-level exclude on tx.ts: `grep -F 'exclude=tx.ts' package.json` exits 0
    - PC-28 grep gate excludes test directories: `grep -F 'exclude-dir=test' package.json` exits 0
    - PC-03 grep gate exists in package.json: `grep -F 'grep:no-pool-connect' package.json` exits 0
    - PC-26 + PC-03 grep gate uses file-level exclude on tx.ts: `grep -F 'appPool' package.json && grep -F 'exclude=tx.ts' package.json` exits 0
    - `.env.example` lists DATABASE_URL_APP, DATABASE_URL_WORKER, DATABASE_URL_MIGRATOR, BUDGET_KEK, BETTER_AUTH_SECRET, REGION: `for k in DATABASE_URL_APP DATABASE_URL_WORKER DATABASE_URL_MIGRATOR BUDGET_KEK BETTER_AUTH_SECRET REGION; do grep -E "^${k}=" .env.example; done` exits 0
    - `README.md` mentions single-region: `grep -i 'single-region' README.md && grep -F 'PLAT-11' README.md` exits 0
    - `.husky/pre-commit` is executable: `test -x .husky/pre-commit` exits 0
    - `.husky/pre-commit` runs both grep gates: `grep -F 'grep:no-direct-tx' .husky/pre-commit && grep -F 'grep:no-pool-connect' .husky/pre-commit` exits 0
    - `.github/workflows/ci.yml` runs depcruise: `grep -F 'depcruise' .github/workflows/ci.yml` exits 0
    - `.github/workflows/ci.yml` runs both grep gates (PC-03, PC-04): `grep -F 'grep:no-direct-tx' .github/workflows/ci.yml && grep -F 'grep:no-pool-connect' .github/workflows/ci.yml` exits 0
    - `bunx depcruise --config .dependency-cruiser.cjs --output-type err apps packages` exits 0 against empty packages
  </acceptance_criteria>
  <done>Wave 0 CI gates wired: dep-cruiser (with PC-02 apps-boundary rule) + ESLint custom rule + PC-04 grep gate (.transaction outside packages/platform/src/db/tx.ts, file-level exclude per PC-26 + test exclude per PC-28) + PC-03 grep gate (appPool().connect outside packages/platform/src/db/tx.ts, same exclude pattern) + Husky pre-commit + .env.example + README PLAT-11 documentation. ENGR-10, MONY-07, ENGR-02 verifiable via CI workflow.</done>
</task>

</tasks>

<threat_model>

## Trust Boundaries

| Boundary                       | Description                                                                       |
| ------------------------------ | --------------------------------------------------------------------------------- |
| Developer machine → repository | Pre-commit hook is the only gate; bypass possible via `--no-verify`               |
| Local commit → CI              | GitHub Actions enforces gates that local hooks may skip                           |
| Repository → secret store      | `.env.example` documents keys; real values never committed (`.env` is gitignored) |

## STRIDE Threat Register

| Threat ID  | Category               | Component                                                                                                                            | Disposition | Mitigation Plan                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ---------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| T-01-00-01 | Tampering              | Domain layer importing ORM/HTTP framework (architecture violation that enables future cross-tenant bugs)                             | mitigate    | dependency-cruiser config bans `drizzle-orm`, `hono`, `@ai-sdk/*` imports from `packages/*/src/domain/`; CI gate fails closed                                                                                                                                                                                                                                                                                                        |
| T-01-00-02 | Information Disclosure | Float arithmetic on `Money` causing silent precision loss / financial bug                                                            | mitigate    | Custom ESLint rule `no-float-money` flags `+=`, `-=`, `*=`, `/=` and binary `+/-/*/` on `*amount/money/total/sum/price/cost/balance` member access; CI gate fails closed                                                                                                                                                                                                                                                             |
| T-01-00-03 | Tampering              | Direct `db.transaction()` outside `withTenantTx` family (bypasses tenant context, enables cross-tenant leak — Phase 1 high-severity) | mitigate    | Two-layer enforcement: (a) dependency-cruiser `no-direct-db-transaction` rule, (b) PC-04 grep CI step `! grep -RnE '\.transaction\(' --exclude=tx.ts --exclude-dir=test apps packages` — only call site repo-wide is `packages/platform/src/db/tx.ts` (PC-26 file-level exclude; PC-28 carve-out for test/ helpers)                                                                                                                  |
| T-01-00-04 | Spoofing               | Secrets committed to repository (`.env` instead of `.env.example`)                                                                   | mitigate    | `.gitignore` excludes `.env`; `.env.example` ships only placeholder values; pre-commit lint-staged does not touch `.env*`                                                                                                                                                                                                                                                                                                            |
| T-01-00-05 | Tampering              | Pre-commit hook bypass (`git commit --no-verify`)                                                                                    | accept      | Pre-commit is dev convenience; GitHub Actions CI is the binding gate. Documented as known-acceptable per solo-developer workflow                                                                                                                                                                                                                                                                                                     |
| T-01-00-06 | Tampering              | apps/\*_ reaching into packages/_/src/{adapters,application,domain,ports} (PC-02 architecture violation)                             | mitigate    | dep-cruiser rule `apps-only-public-package-surface` bans the path pattern; apps/_ must consume packages/_ via the public surface (src/index.ts + contracts/\*\*); CI fails closed                                                                                                                                                                                                                                                    |
| T-01-00-07 | Tampering              | Hook code escaping tenant context via raw `appPool().connect(` (PC-03 risk)                                                          | mitigate    | grep CI step `! grep -RnE 'appPool\(\)\.connect\(' --exclude=tx.ts --exclude-dir=test apps packages` — outside `packages/platform/src/db/tx.ts`, no other call site is allowed (PC-26 file-level exclude; PC-28 carve-out for test/ helpers like the testcontainer bootstrap). PC-27: tenant-guard middleware uses the `withBootstrapUserContext` primitive (Plan 02) for legitimate bootstrap reads; pre-commit also runs this gate |

## PC-17 ESLint Rule — Phase 6 (Documented Limitation)

PC-17 (deferred): A more sophisticated ESLint rule could enforce additional invariants — e.g. flag direct `process.env.X` reads outside `loadEnv()`, flag `console.log` in non-test code paths. Phase 1 keeps `no-float-money` as the single custom rule; Phase 6 hardening can extend.
</threat_model>

<verification>
Run all in sequence:
```bash
bun install --frozen-lockfile
bun run --filter='*' typecheck
bunx depcruise --config .dependency-cruiser.cjs --output-type err apps packages
bun run grep:no-direct-tx                                              # PC-04 — must exit 0 against empty repo
bun run grep:no-pool-connect                                           # PC-03 — must exit 0 against empty repo
bunx eslint tests/fixtures/float-money-clean.ts                       # must pass
bunx eslint tests/fixtures/float-money.ts; test $? -ne 0              # must fail
bun test                                                              # zero tests, exits 0
```
All eight steps must exit 0.
</verification>

<success_criteria>

- bun install resolves all 4 apps + 6 packages (shared-kernel, identity, tenancy, platform, crypto, db)
- tsconfig.base.json strict mode covers all packages (tsc --noEmit passes)
- All package.json exports point at src/index.ts (PC-15 — no /dist/, Bun runs TS natively)
- dependency-cruiser blocks domain → drizzle-orm/hono/adapters/sibling-package imports
- dependency-cruiser blocks apps/\*_ → packages/_/src/{adapters,application,domain,ports} (PC-02 boundary)
- ESLint custom rule `no-float-money` flags float arithmetic on Money-named identifiers
- PC-04 grep gate blocks `.transaction(` calls outside `packages/platform/src/db/tx.ts` (single repo-wide call site, file-level exclude per PC-26 + test exclude per PC-28)
- PC-03 grep gate blocks `appPool().connect(` calls outside `packages/platform/src/db/tx.ts` (file-level exclude per PC-26 + test exclude per PC-28; PC-27: legitimate bootstrap reads use `withBootstrapUserContext` primitive)
- Husky pre-commit hook executable, runs lint-staged + both grep gates
- bun:test runs (0 tests) with PC-23 narrowed coverage gate (80% domain only)
- Vitest 4 + happy-dom + @testing-library/react ready in `apps/web`
- Playwright config compiles
- .env.example enumerates all required env vars
- README.md documents PLAT-11 single-region v1
- GitHub Actions CI workflow runs typecheck + depcruise + both grep gates + eslint fixture pair + bun test
  </success_criteria>

<output>
After completion, create `.planning/phases/01-foundations/01-00-SUMMARY.md`
</output>
</content>
</invoke>
