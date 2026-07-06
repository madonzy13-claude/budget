/**
 * budgeting-reconciliation.ts — Hourly cron for the Phase-7 task-generator sweeps.
 *
 * Schedule: 0 * * * * UTC.
 * Algorithm:
 *   1. SELECT DISTINCT tenant_id from budgeting.wallets (via withInfraTx — no RLS needed for scan)
 *   2. Per tenant, run the two task generator sweeps (RESERVE_TOPUP + CUSHION_BELOW_TARGET)
 *      under withTenantTx(tenantId, SYSTEM_USER) so inline-emit misses (FX drift,
 *      manual DB edits, future mutation paths not yet hooked) are caught within
 *      ≤60 minutes. The sweeps are idempotent (ON CONFLICT DO NOTHING + WHERE
 *      PENDING) so they no-op when the inline path already converged.
 *
 * HISTORY: this handler also used to run reconcileProjections() — an ENGR-14
 * drift check that kept budgeting.spending_by_category_month in sync with the
 * ledger. That projection is now DEAD (the live write path no longer upserts it
 * and nothing reads it for display — the read model moved to replay-on-read), and
 * its query still referenced the pre-migration column set (corrects_id /
 * amount_default / currency_default / fx_rate_date / fx_provider), so it errored
 * every hour. Removed (2026-07-01, user-approved) — only the sweeps remain.
 *
 * System user sentinel: 00000000-0000-0000-0000-000000000001 (D-05-g).
 */
import { sql } from "drizzle-orm";
import { withInfraTx, withTenantTx } from "@budget/platform";
import { ok, type Result } from "@budget/shared-kernel";
import { TenantId, UserId } from "@budget/shared-kernel";
import { recomputeReserveTopupTask } from "@budget/budgeting/src/application/recompute-reserve-topup-task";
import { recomputeCushionTask } from "@budget/budgeting/src/application/recompute-cushion-task";
import { recomputeIncomeUnderPlannedTask } from "@budget/budgeting/src/application/recompute-income-under-planned-task";
import type { RecomputeReserveTopupTaskDeps } from "@budget/budgeting/src/application/recompute-reserve-topup-task";
import type { RecomputeCushionTaskDeps } from "@budget/budgeting/src/application/recompute-cushion-task";

interface PgBossLike {
  work(
    queue: string,
    handler: (job: unknown) => Promise<unknown>,
  ): Promise<void>;
}

/** SYSTEM_USER sentinel — same UUID used by the recurring-engine handler. */
const SYSTEM_USER_ID = "00000000-0000-0000-0000-000000000001";

/**
 * Sweep dependencies. When omitted, the hourly run is a no-op scan (back-compat);
 * when provided, the per-tenant loop runs the two Phase 7 task generator sweeps.
 *
 * Same dep shape as the inline mutation hooks so apps/worker/src/worker.ts wires
 * them with the same factory pattern.
 */
export interface BudgetingReconciliationSweepDeps {
  reserveTopup: RecomputeReserveTopupTaskDeps;
  cushion: RecomputeCushionTaskDeps;
}

export interface ReconciliationOutput {
  tenantsScanned: number;
  /** Phase 7 (D-PH7-04): tenants where the RESERVE_TOPUP sweep succeeded. */
  reserveTopupsSwept: number;
  /** Phase 7 (D-PH7-19): tenants where the CUSHION_BELOW_TARGET sweep succeeded. */
  cushionTasksSwept: number;
}

/** Core handler logic — exported for direct testing.
 *
 * `todayOverride` is retained on the signature for back-compat with callers/tests;
 * the projection drift window it fed was removed with reconcileProjections.
 */
export async function runBudgetingReconciliation(
  _todayOverride?: string,
  sweepDeps?: BudgetingReconciliationSweepDeps,
): Promise<Result<ReconciliationOutput, Error>> {
  // Step 1: collect distinct tenants (worker_role, no RLS — wallets is GRANT-restricted)
  const tenantsResult = await withInfraTx(async (tx) => {
    const drizzleTx = tx as {
      execute: (q: unknown) => Promise<{ rows: Record<string, unknown>[] }>;
    };
    const r = await drizzleTx.execute(sql`
      SELECT DISTINCT tenant_id FROM budgeting.wallets
    `);
    return r.rows as Array<{ tenant_id: string }>;
  });

  if (tenantsResult.isErr())
    return tenantsResult as unknown as Result<ReconciliationOutput, Error>;
  const tenants = tenantsResult.value;

  let reserveTopupsSwept = 0;
  let cushionTasksSwept = 0;

  // Step 2: per-tenant task-generator sweeps (projection drift-check removed — see
  // the file header; that projection is dead + its query was stale).
  for (const { tenant_id } of tenants) {
    // Phase 7 (D-PH7-04, D-PH7-19) sweep — only when deps are wired.
    // v1.1: budget_id === tenant_id; each tenant has exactly one budget so we
    // skip the inner budgets loop. If/when multi-budget-per-tenant lands,
    // open an inner `SELECT id FROM tenancy.budgets WHERE …` loop here.
    if (sweepDeps) {
      // RESERVE_TOPUP sweep — fresh withTenantTx(SYSTEM_USER) per tenant.
      const reserveR = await withTenantTx(
        TenantId(tenant_id),
        UserId(SYSTEM_USER_ID),
        async (tx) => {
          await recomputeReserveTopupTask(
            tx as unknown as {
              execute: (
                q: unknown,
              ) => Promise<{ rows: Record<string, unknown>[] }>;
            },
            { tenantId: tenant_id, budgetId: tenant_id },
            sweepDeps.reserveTopup,
          );
        },
      );
      if (reserveR.isErr()) {
        console.error(
          `[budgeting-reconciliation] reserve sweep failed for tenant ${tenant_id}:`,
          reserveR.error,
        );
        // Continue to cushion sweep — one tenant's failure must not abort.
      } else {
        reserveTopupsSwept++;
      }

      // CUSHION_BELOW_TARGET sweep — fresh withTenantTx(SYSTEM_USER) per tenant.
      const cushionR = await withTenantTx(
        TenantId(tenant_id),
        UserId(SYSTEM_USER_ID),
        async (tx) => {
          await recomputeCushionTask(
            tx as unknown as {
              execute: (
                q: unknown,
              ) => Promise<{ rows: Record<string, unknown>[] }>;
            },
            { tenantId: tenant_id, budgetId: tenant_id },
            sweepDeps.cushion,
          );
        },
      );
      if (cushionR.isErr()) {
        console.error(
          `[budgeting-reconciliation] cushion sweep failed for tenant ${tenant_id}:`,
          cushionR.error,
        );
      } else {
        cushionTasksSwept++;
      }

      // r33: INCOME_UNDER_PLANNED sweep — backstop for income-currency FX drift +
      // default-currency change. Same deps as cushion ({taskRepo, fxProvider}).
      const incomeR = await withTenantTx(
        TenantId(tenant_id),
        UserId(SYSTEM_USER_ID),
        async (tx) => {
          await recomputeIncomeUnderPlannedTask(
            tx as unknown as {
              execute: (
                q: unknown,
              ) => Promise<{ rows: Record<string, unknown>[] }>;
            },
            { tenantId: tenant_id, budgetId: tenant_id },
            sweepDeps.cushion,
          );
        },
      );
      if (incomeR.isErr()) {
        console.error(
          `[budgeting-reconciliation] income-under-planned sweep failed for tenant ${tenant_id}:`,
          incomeR.error,
        );
      }
    }
  }

  console.log(
    `[budgeting-reconciliation] scanned=${tenants.length} reserveTopupsSwept=${reserveTopupsSwept} cushionTasksSwept=${cushionTasksSwept}`,
  );

  return ok({
    tenantsScanned: tenants.length,
    reserveTopupsSwept,
    cushionTasksSwept,
  });
}

/** Register pg-boss handler on the budgeting-reconciliation queue.
 *
 * `sweepDeps` is optional so the legacy single-arg `registerBudgetingReconciliation(boss)`
 * call still compiles — when omitted, the hourly run only scans tenants. worker.ts
 * wires the deps so the sweeps actually run in prod.
 */
export function registerBudgetingReconciliation(
  boss: PgBossLike,
  sweepDeps?: BudgetingReconciliationSweepDeps,
): void {
  boss.work("budgeting-reconciliation", async () => {
    return runBudgetingReconciliation(undefined, sweepDeps);
  });
}
