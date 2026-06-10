/**
 * recompute-cushion-task.ts — Shared create-or-resolve helper for the
 * CUSHION_BELOW_TARGET task kind (Phase 7, D-PH7-24).
 *
 * Called by EVERY mutation that can change cushion shortfall. Encapsulates the
 * emit-or-resolve decision so the 6+ caller sites do not branch on shortfall
 * sign themselves.
 *
 * Caller sites (Plans 04/05/06/07):
 *   - set-wallet-balance.ts (CUSHION wallet balance change)
 *   - update-wallet.ts (CUSHION wallet rename / type / currency change)
 *   - create-wallet.ts (new CUSHION wallet)
 *   - archive-wallet.ts (CUSHION wallet removal)
 *   - set-category-limit.ts (category cushion_amount change)
 *   - budgets PATCH route (cushion_enabled / cushion_target_months change)
 *   - budgeting-reconciliation.ts (hourly sweep — catches FX drift)
 *
 * Hex boundary: this file has zero persistence-adapter imports and zero
 * HTTP-framework imports. Only ports + the sibling pure-shape application
 * service get-cushion-summary.
 *
 * Idempotency contract:
 *   - emit:    INSERT ON CONFLICT DO NOTHING (DB-enforced via partial unique
 *              index from migration 0026 — tasks_cushion_below_target_pending_uq)
 *   - resolve: UPDATE WHERE status='PENDING' — already-RESOLVED rows silently
 *              no-op (0 rows updated)
 *
 *   Safe to call N times in succession against the same (tenantId, budgetId).
 */
import { computeCushionSummary } from "./get-cushion-summary";
import type { TaskRepo, CushionBelowTargetPayload } from "../ports/task-repo";
import type { FxProviderLike } from "./recurring-engine-fx";

/**
 * Minimal tx shape — matches the port's TenantTx so callers can pass their
 * existing tx forward without re-wrapping.
 */
type TenantTx = {
  execute: (q: unknown) => Promise<{ rows: Record<string, unknown>[] }>;
};

export interface RecomputeCushionTaskInput {
  tenantId: string;
  budgetId: string;
}

export interface RecomputeCushionTaskDeps {
  taskRepo: TaskRepo;
  fxProvider: FxProviderLike;
}

/**
 * Recompute cushion shortfall and emit-or-resolve the CUSHION_BELOW_TARGET
 * task. MUST be called inside an existing withTenantTx — `tx` is mandatory.
 *
 * Decision tree:
 *   summary.enabled = false           → resolveByKindAndBudget (no-op if none open)
 *   shortfall <= 0                    → resolveByKindAndBudget (no-op if none open)
 *   shortfall > 0 AND enabled = true  → emitCushionBelowTarget (no-op if one already PENDING)
 */
export async function recomputeCushionTask(
  tx: TenantTx,
  input: RecomputeCushionTaskInput,
  deps: RecomputeCushionTaskDeps,
): Promise<void> {
  const summary = await computeCushionSummary(tx, {
    tenantId: input.tenantId,
    budgetId: input.budgetId,
    fxProvider: deps.fxProvider,
  });

  const shortfall = BigInt(summary.shortfall_cents);

  if (!summary.enabled || shortfall <= 0n) {
    // Resolve any open CUSHION_BELOW_TARGET task for this budget.
    await deps.taskRepo.resolveByKindAndBudget(
      input.tenantId,
      input.budgetId,
      "CUSHION_BELOW_TARGET",
      tx,
    );
    return;
  }

  // Emit (no-op via ON CONFLICT DO NOTHING if one is already pending).
  const payload: CushionBelowTargetPayload = {
    shortfall_cents: summary.shortfall_cents,
    required_cents: summary.required_cents,
    actual_cents: summary.actual_cents,
    currency: summary.currency,
    target_months: summary.target_months,
  };
  await deps.taskRepo.emitCushionBelowTarget(
    input.tenantId,
    input.budgetId,
    payload,
    tx,
  );
}
