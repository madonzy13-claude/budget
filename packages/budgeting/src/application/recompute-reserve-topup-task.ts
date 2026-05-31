/**
 * recompute-reserve-topup-task.ts — Shared create-or-resolve helper for the
 * RESERVE_TOPUP task kind (Phase 7, D-PH7-03..07).
 *
 * Called by EVERY mutation that can change reserve mismatch. Encapsulates the
 * emit-or-resolve decision so the 4+ caller sites do not branch on mismatch
 * sign themselves.
 *
 * Caller sites (Plans 05/06):
 *   - set-wallet-balance.ts        (RESERVE wallet balance change)
 *   - update-wallet.ts             (RESERVE wallet rename / type / currency change)
 *   - adjust-category-reserve.ts   (reserve adjustment)
 *   - budgeting-reconciliation.ts  (hourly sweep — Plan 06)
 *
 * Hex boundary: this file has zero persistence-adapter imports and zero
 * HTTP-framework imports. It composes:
 *   - getReservesSummary (sibling pure-shape application service)
 *   - TaskRepo port (emit + resolve)
 *
 * Math source (D-PH7-03):
 *   Internally calls getReservesSummary which uses reserves-summary-builder.ts
 *   buildReservesSummaryDto. The DTO carries `mismatchCents` as a bigint-as-string:
 *       mismatchCents = walletPoolCents − totalCategoryReservesCents
 *   So:
 *     mismatch  >  0  →  wallets > reserves    → user should WITHDRAW excess
 *     mismatch  <  0  →  wallets < reserves    → user should TOPUP wallets
 *     mismatch  === 0 →  in sync               → resolve any open RESERVE_TOPUP
 *
 * Idempotency contract (D-PH7-05):
 *   - emit:    INSERT ON CONFLICT DO NOTHING (DB-enforced via partial unique
 *              index from migration 0026 — tasks_reserve_topup_pending_uq on
 *              (budget_id) WHERE kind='RESERVE_TOPUP' AND status='PENDING')
 *   - resolve: UPDATE WHERE status='PENDING' — already-RESOLVED rows silently
 *              no-op (0 rows updated)
 *
 *   Safe to call N times in succession against the same (tenantId, budgetId).
 *
 * When reserves are disabled (budgets.reserves_enabled = false), getReservesSummary
 * returns disabled=true + zero values + mismatchCents="0" — the helper resolves
 * any open RESERVE_TOPUP without emitting (correct behaviour: disabling reserves
 * implies the task is moot).
 */
import { getReservesSummary } from "./get-reserves-summary";
import type { TaskRepo, ReserveTopupPayload } from "../ports/task-repo";
import type { CategoriesRepo } from "../ports/categories-repo";
import type { ReserveBalanceRepo } from "../ports/reserve-balance-repo";
import type { ReservesSummaryRepo } from "../ports/reserves-summary-repo";

/**
 * Minimal tx shape — matches the port's TenantTx so callers can pass their
 * existing tx forward without re-wrapping.
 */
type TenantTx = {
  execute: (q: unknown) => Promise<{ rows: Record<string, unknown>[] }>;
};

export interface RecomputeReserveTopupTaskInput {
  tenantId: string;
  budgetId: string;
}

export interface RecomputeReserveTopupTaskDeps {
  taskRepo: TaskRepo;
  // Same dep shape as GetReservesSummaryDeps so callers (set-wallet-balance,
  // update-wallet, adjust-category-reserve) can forward their existing deps
  // straight through.
  categoriesRepo: CategoriesRepo;
  reserveBalanceRepo: ReserveBalanceRepo;
  reservesSummaryRepo: ReservesSummaryRepo;
  budgetCurrencyOf: (tenantId: string) => Promise<string>;
  isReservesEnabled: (tenantId: string) => Promise<boolean>;
}

/**
 * Recompute reserve mismatch and emit-or-resolve the RESERVE_TOPUP task.
 *
 * MUST be called inside an existing withTenantTx — `tx` is mandatory so the
 * emit/resolve write piggybacks the caller's tx (atomic with the trigger
 * mutation). The summary fetch itself uses internal repo txs (the reserve
 * read-model adapter opens its own withTenantTx — A2 pattern).
 *
 * Decision tree:
 *   disabled = true (reserves_enabled false)  → resolveByKindAndBudget (no-op if none open)
 *   mismatch === 0n                            → resolveByKindAndBudget (no-op if none open)
 *   mismatch !== 0n                            → emitReserveTopup (no-op if one already PENDING)
 */
export async function recomputeReserveTopupTask(
  tx: TenantTx,
  input: RecomputeReserveTopupTaskInput,
  deps: RecomputeReserveTopupTaskDeps,
): Promise<void> {
  const summaryResult = await getReservesSummary({
    reserveBalanceRepo: deps.reserveBalanceRepo,
    reservesSummaryRepo: deps.reservesSummaryRepo,
    categoriesRepo: deps.categoriesRepo,
    budgetCurrencyOf: deps.budgetCurrencyOf,
    isReservesEnabled: deps.isReservesEnabled,
  })({ tenantId: input.tenantId, budgetId: input.budgetId });

  if (summaryResult.isErr()) {
    // Surface the read failure to the caller; emit would be unsafe with
    // unknown mismatch state. Mutation tx rolls back via Result propagation.
    throw summaryResult.error;
  }

  const summary = summaryResult.value;
  const mismatchCents = BigInt(summary.totals.mismatchCents);

  if (summary.totals.disabled || mismatchCents === 0n) {
    // Reserves disabled OR wallets/reserves in sync → resolve any open task.
    await deps.taskRepo.resolveByKindAndBudget(
      input.tenantId,
      input.budgetId,
      "RESERVE_TOPUP",
      tx,
    );
    return;
  }

  // Sign convention (verified against reserves-summary-builder.ts:73):
  //   mismatchCents = walletPoolCents - totalCategoryReservesCents
  //   > 0 → wallets > reserves → WITHDRAW excess
  //   < 0 → wallets < reserves → TOPUP wallets
  const absShortfall = mismatchCents < 0n ? -mismatchCents : mismatchCents;
  const direction: "TOPUP" | "WITHDRAW" =
    mismatchCents < 0n ? "TOPUP" : "WITHDRAW";

  const payload: ReserveTopupPayload = {
    shortfall_cents: absShortfall.toString(),
    direction,
    currency: summary.totals.budgetCurrency,
  };
  await deps.taskRepo.emitReserveTopup(
    input.tenantId,
    input.budgetId,
    payload,
    tx,
  );
}
