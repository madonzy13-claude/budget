# 05-16 Summary — Dead-code sweep + full gates (reserve rewrite complete)

**Status:** ✅ Complete. All reserve dead code removed; reserve suites + E2E green. One PRE-EXISTING, out-of-scope ci-gate failure flagged (Phase-7 tasks, not reserves).
**Date:** 2026-06-05

## Dead code removed (grep-clean)

- `packages/budgeting/src/adapters/persistence/reserve-balance-repo.ts` + `ports/reserve-balance-repo.ts` + its test — the dropped-VIEW reader, zero live call sites.
- `packages/budgeting/src/domain/reserve-ledger.ts` + test — superseded by `reserve-engine.ts`.
- `apps/web/src/lib/reserve-allocator.ts` + `mismatch-chip.tsx` (deleted in 05-15); backend `reserve-allocator.ts` (deleted in 05-13).
- Dead VIEW-era tests: `reserve-view-accrual.test.ts`, `category-limit-per-month.test.ts`, `category-removal-modes.test.ts`.
- Dead-symbol grep across src (reserve-allocator / reserve-ledger / reserve-balance-repo / reserve_actual_cents / category_reserve_balance / applyExpectedChange / refillUnderfunded / setReserveActualMany / mismatchCents / walletShareAmount) → only doc-comments remain; **no live code**.

## Migration reconciliation

- Committed the needed **`0028_category_archived_from.sql`** (was untracked though journaled) — `categories.archived_from` powers the deletion modes.
- Removed dead **`0029_reserve_discarded_overspend.sql`** (created the VIEW that `0030` drops) + excised its `_journal.json` entry. Journal now `…0027, 0028, 0030` (valid JSON, 30 entries). Column/VIEW are created by committed `0013–0022` and dropped by `0030`, so fresh-DB migrate stays correct.

## Seed-helper fixes (migration fallout)

- `cushion-math.test.ts` + `confirm-draft.test.ts` were INSERTing the dropped `reserve_actual_cents` → `42703` broke 16 integration tests. Removed the column from both seeds.

## Gate results

- **budgeting `bun:test` (under Infisical):** 302 pass / 0 fail / 40 files.
- **api `tsc --noEmit`:** 0 errors (reserve work fully type-clean).
- **budgeting src `tsc`:** 15 errors — all PRE-EXISTING, non-reserve (budget-template-apply, share-overrides-sum-trigger, frankfurter-adapter, category-domain). Baseline unchanged.
- **Reserve E2E** (`@tasks-redesign`, rebuilt web): 12/12 pass (reserve+used columns/no Share, surplus WITHDRAW, adjust→TOPUP, disabled notice).
- **Reserve component/hook (Vitest):** 45/45.
- **i18n:** EN + real PL + real UK present for all new reserve keys (reserve/used/internalLabel/surplus topup·withdraw·reconciled).
- **graphify:** background `graphify update` launched by the commit hook.

## ⚠ Flagged — PRE-EXISTING, OUT OF SCOPE (not reserves)

`make ci-gate`: **40 pass / 3 fail.** All 3 fails are in `tests/tenant-leak/tasks-cross-tenant.test.ts` (`createTaskRepo().resolve` cross-tenant + same-tenant sanity), failing with `Received: undefined` — the seeded **task** row isn't found, i.e. a setup issue in the Phase-7 **tasks** tenant-leak test, not a real leak. Evidence it is NOT the reserve rewrite:

- `task-repo.ts` / `tasks-schema.ts` / that test are **not touched** by any reserve commit (`git log ec9e32b..HEAD` empty for them).
- `task-repo.ts` carries **uncommitted Phase-7 tasks-redesign** changes (present at session start), the likely cause.
- The test seeds no dropped column (not migration fallout).
- All reserve-related tenant-leak checks pass (the 40).

→ Belongs to Phase-7 tasks-redesign; left untouched per "work on reserves only, don't proceed with other phases."

## Reserve rewrite — DONE

Golden table (29 rows) + multi-month accrual + retroactive coverage + disable→re-enable idempotency proven in the pure engine; persistence reset + replay orchestrator + use-cases + contracts/API + UI all on the new model; old expected/actual + wallet-as-source + greedy allocator + VIEW fully deleted.
