/**
 * recompute-reserve-topup-task.ts — Shared create-or-resolve helper for the
 * RESERVE_TOPUP task kind (Phase 7, D-PH7-03..07; rewritten 05-13).
 *
 * Called by EVERY mutation that can change reserve surplus. Encapsulates the
 * emit-or-resolve decision so the 4+ caller sites do not branch on surplus
 * sign themselves.
 *
 * Caller sites (Plans 05/06):
 *   - set-wallet-balance.ts        (RESERVE wallet balance change → userDefined)
 *   - update-wallet.ts             (RESERVE wallet rename / type / currency change)
 *   - adjust-category-reserve.ts   (reserve adjustment delta → internal)
 *   - archive-category.ts          (archived category leaves internal)
 *   - budgeting-reconciliation.ts  (hourly sweep — Plan 06)
 *
 * Hex boundary: this file has zero persistence-adapter imports and zero
 * HTTP-framework imports. It composes:
 *   - the replay orchestrator (get-reserve-positions) via the `reservePositions`
 *     dep — the single source of truth for surplus + direction.
 *   - TaskRepo port (emit + resolve)
 *
 * Math source (05-13 — reads the orchestrator's surplus DIRECTLY, no more
 * summary-read round-trip):
 *       surplus = userDefined − internal      (= Σ RESERVE wallets − ΣR)
 *   So:
 *     surplus  >  0  →  wallets > reserves    → user should WITHDRAW excess
 *     surplus  <  0  →  wallets < reserves    → user should TOPUP wallets
 *     surplus  === 0 →  in sync               → resolve any open RESERVE_TOPUP
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
 * When reserves are disabled (budgets.reserves_enabled = false) the helper
 * resolves any open RESERVE_TOPUP WITHOUT reading positions or emitting
 * (correct behaviour: disabling reserves implies the task is moot — decision K).
 */
import type { Result } from "@budget/shared-kernel";
import type { TaskRepo, ReserveTopupPayload } from "../ports/task-repo";
import type { ReservePositionsResult } from "./get-reserve-positions";

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
  /**
   * Replay orchestrator (05-12 — get-reserve-positions). The RESERVE_TOPUP
   * task reflects engine-derived reserve: surplus = userDefined − internal,
   * direction = surplus sign. NO stored-actual / VIEW / greedy share.
   */
  reservePositions: (input: {
    tenantId: string;
    budgetId: string;
  }) => Promise<Result<ReservePositionsResult, Error>>;
  budgetCurrencyOf: (tenantId: string) => Promise<string>;
  isReservesEnabled: (tenantId: string) => Promise<boolean>;
}

/**
 * Recompute reserve surplus and emit-or-resolve the RESERVE_TOPUP task.
 *
 * MUST be called inside an existing withTenantTx — `tx` is mandatory so the
 * emit/resolve write piggybacks the caller's tx (atomic with the trigger
 * mutation). The positions read itself uses internal repo txs (the event
 * loader opens its own withTenantTx — A2 pattern).
 *
 * Decision tree (05-13):
 *   reserves disabled        → resolveByKindAndBudget (no-op if none open)
 *   surplus === 0n           → resolveByKindAndBudget (no-op if none open)
 *   surplus  <  0n           → emit TOPUP    shortfall |surplus|
 *   surplus  >  0n           → emit WITHDRAW shortfall  surplus
 */
export async function recomputeReserveTopupTask(
  tx: TenantTx,
  input: RecomputeReserveTopupTaskInput,
  deps: RecomputeReserveTopupTaskDeps,
): Promise<void> {
  // Disabled → resolve any open task without reading positions or emitting.
  if (!(await deps.isReservesEnabled(input.tenantId))) {
    await deps.taskRepo.resolveByKindAndBudget(
      input.tenantId,
      input.budgetId,
      "RESERVE_TOPUP",
      tx,
    );
    return;
  }

  const posResult = await deps.reservePositions({
    tenantId: input.tenantId,
    budgetId: input.budgetId,
  });
  if (posResult.isErr()) {
    // Surface the read failure to the caller; emit would be unsafe with an
    // unknown surplus state. Mutation tx rolls back via the throw.
    throw posResult.error;
  }

  const surplus = posResult.value.surplusCents;

  if (surplus === 0n) {
    await deps.taskRepo.resolveByKindAndBudget(
      input.tenantId,
      input.budgetId,
      "RESERVE_TOPUP",
      tx,
    );
    return;
  }

  // Sign convention (surplus = userDefined − internal; matches the position
  // orchestrator's `direction`):
  //   surplus > 0 → wallets > reserves → WITHDRAW excess
  //   surplus < 0 → wallets < reserves → TOPUP wallets
  const direction: "TOPUP" | "WITHDRAW" = surplus < 0n ? "TOPUP" : "WITHDRAW";
  const shortfall = surplus < 0n ? -surplus : surplus;

  const payload: ReserveTopupPayload = {
    shortfall_cents: shortfall.toString(),
    direction,
    currency: await deps.budgetCurrencyOf(input.tenantId),
  };
  await deps.taskRepo.emitReserveTopup(
    input.tenantId,
    input.budgetId,
    payload,
    tx,
  );
}
