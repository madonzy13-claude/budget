# Deferred Items

Out-of-scope discoveries logged during execution. NOT fixed by the current task.

## 260613-v1p (execute)

- **`packages/budgeting/test/db-constraints/ledger-immutability.test.ts:51`** —
  `app_role cannot DELETE from expense_ledger` fails. Confirmed PRE-EXISTING: fails
  identically on a clean tree (`git stash` of all v1p changes → still 1 fail / 3 pass).
  Unrelated to category color (no ledger/RLS files touched). RLS-grant/env state debt.
- **Pre-existing budgeting test typecheck drift** (NOT mine, src/ typechecks clean):
  `get-spendings-summary.test.ts` + `reserves-use-cases.test.ts` fixtures miss
  `openMonth` / `reserveExcluded` on ReservePositionsResult/ReservePosition;
  `budget-template-apply.test.ts` reads `.value` on a `Result` without an isOk guard;
  `get-budget-home-summary.test.ts:183` toBeNull(true). These fail tsc on test files
  only — production code (`src/`) has 0 type errors.

## 260614-ipk (execute)

- **`apps/web/test/shell-safe-area.test.ts` — 2 failing** (PRE-EXISTING, out of scope):
  - "browser mode pins the header and offsets the BDP tab band below it"
  - "#2: ActivePillTaskSlider IS inside the pb-shell-safe content wrapper"
    Confirmed pre-existing: both assertions read `budgets/[id]/layout.tsx` (the BDP
    layout) which is BYTE-IDENTICAL before and after this task (`git diff HEAD~3:..HEAD:`
    on both the test file and the BDP layout → identical). This task touched only
    `(app)/layout.tsx`, the offline hook/island, sw-offline.ts and offline.html — none
    read by those two assertions. They belong to the in-progress iOS shell-redesign
    rounds (SHELL-R17/R18) on this branch, not to offline resilience. Do NOT fix here.
- **`next build` ESLint gate: `react-hooks/exhaustive-deps` rule not found**
  (PRE-EXISTING config debt, out of scope). Fails on `pill-task-slider.tsx:86` and
  `use-budget-data.ts:121` — both files UNTOUCHED by this task (last touched by e82 /
  08-03). It is a plugin-resolution error ("Definition for rule … was not found"),
  not a code defect. `next build` compiles successfully and `tsc --noEmit` is clean
  (exit 0), so the OfflineResilience island mount type-checks fine; only the eslint
  rule-resolution aborts the lint phase. Deploy via Docker (`make restart-web`).

## 260614-q1v (execute)

- **`apps/web` ESLint gate: same `react-hooks/exhaustive-deps` rule-not-found**
  (PRE-EXISTING config debt, out of scope — re-confirmed). `bun run lint`
  (`eslint src --max-warnings 0`) still fails ONLY on `pill-task-slider.tsx:86`
  - `use-budget-data.ts:121` — both byte-identical, last touched by e82 / 08-03,
    NOT by q1v (the disable-comments reference a rule the flat config no longer
    registers; `eslint-plugin-react-hooks` is not wired into the flat config). All
    q1v-modified files lint clean (verified file-by-file via direct `bunx eslint`).
    `tsc --noEmit` exit 0. Fixing requires registering the plugin in the flat
    eslint config — a config/architectural change unrelated to the offline refactor.
