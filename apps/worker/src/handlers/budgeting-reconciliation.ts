/**
 * budgeting-reconciliation.ts — Hourly cron for ENGR-14 projection drift checks (Plan 02-09).
 *
 * Schedule: 0 * * * * UTC.
 * Algorithm:
 *   1. SELECT DISTINCT tenant_id from budgeting.wallets (via withInfraTx — no RLS needed for scan)
 *   2. Per tenant: call reconcileProjections({tenantId, monthStart=2 months ago, monthEnd=current})
 *      under withTenantTx(tenantId, SYSTEM_USER).
 *   3. Phase 7 (D-PH7-04 / D-PH7-19) — per tenant, also call the two task
 *      generator sweeps so that inline-emit misses (FX drift, manual DB
 *      edits, future mutation paths not yet hooked) are caught within
 *      ≤60 minutes. The sweeps are idempotent (ON CONFLICT DO NOTHING +
 *      WHERE PENDING) so they no-op when the inline path already converged.
 *
 * Returns observability counters extended with reserveTopupsSwept +
 * cushionTasksSwept (Phase 7).
 *
 * System user sentinel: 00000000-0000-0000-0000-000000000001 (D-05-g).
 *
 * Per "Claude's Discretion" in 07-CONTEXT.md: the new sweeps share this
 * existing handler's per-tenant loop rather than adding a separate cron —
 * saves a registration and shares the SELECT DISTINCT tenant_id scan.
 */
import { sql } from "drizzle-orm";
import { withInfraTx, withTenantTx } from "@budget/platform";
import { ok, type Result } from "@budget/shared-kernel";
import { TenantId, UserId } from "@budget/shared-kernel";
import { Temporal } from "temporal-polyfill";
import { reconcileProjections } from "@budget/budgeting/src/application/reconcile-projections";
import { recomputeReserveTopupTask } from "@budget/budgeting/src/application/recompute-reserve-topup-task";
import { recomputeCushionTask } from "@budget/budgeting/src/application/recompute-cushion-task";
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
 * Sweep dependencies — when omitted, only the existing projection reconcile
 * runs (back-compat). When provided, the per-tenant loop also runs the two
 * Phase 7 task generator sweeps.
 *
 * Same dep shape as the inline mutation hooks so apps/worker/src/worker.ts
 * wires them with the same factory pattern.
 */
export interface BudgetingReconciliationSweepDeps {
  reserveTopup: RecomputeReserveTopupTaskDeps;
  cushion: RecomputeCushionTaskDeps;
}

export interface ReconciliationOutput {
  tenantsScanned: number;
  totalChecked: number;
  totalRepaired: number;
  totalAlerted: number;
  /** Phase 7 (D-PH7-04): tenants where the RESERVE_TOPUP sweep succeeded. */
  reserveTopupsSwept: number;
  /** Phase 7 (D-PH7-19): tenants where the CUSHION_BELOW_TARGET sweep succeeded. */
  cushionTasksSwept: number;
}

/**
 * Computes [monthStart=first day of (today - 2 months), monthEnd=last day of current month].
 */
function rollingThreeMonthWindow(today: Temporal.PlainDate): {
  monthStart: string;
  monthEnd: string;
} {
  const start = today.subtract({ months: 2 }).with({ day: 1 });
  const end = today.with({ day: today.daysInMonth });
  return { monthStart: start.toString(), monthEnd: end.toString() };
}

/** Core handler logic — exported for direct testing. */
export async function runBudgetingReconciliation(
  todayOverride?: string,
  sweepDeps?: BudgetingReconciliationSweepDeps,
): Promise<Result<ReconciliationOutput, Error>> {
  const today = todayOverride
    ? Temporal.PlainDate.from(todayOverride)
    : Temporal.Now.plainDateISO();
  const { monthStart, monthEnd } = rollingThreeMonthWindow(today);

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

  let totalChecked = 0;
  let totalRepaired = 0;
  let totalAlerted = 0;
  let reserveTopupsSwept = 0;
  let cushionTasksSwept = 0;

  // Step 2: per-tenant reconcile (each call wraps its own withTenantTx(SYSTEM_USER))
  const reconcile = reconcileProjections();
  for (const { tenant_id } of tenants) {
    const r = await reconcile({ tenantId: tenant_id, monthStart, monthEnd });
    if (r.isOk()) {
      totalChecked += r.value.checked;
      totalRepaired += r.value.repaired;
      totalAlerted += r.value.alerted;
    } else {
      console.error(
        `[budgeting-reconciliation] tenant=${tenant_id} err:`,
        r.error,
      );
    }

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
    }
  }

  console.log(
    `[budgeting-reconciliation] scanned=${tenants.length} checked=${totalChecked} repaired=${totalRepaired} alerted=${totalAlerted} reserveTopupsSwept=${reserveTopupsSwept} cushionTasksSwept=${cushionTasksSwept} window=${monthStart}..${monthEnd}`,
  );

  return ok({
    tenantsScanned: tenants.length,
    totalChecked,
    totalRepaired,
    totalAlerted,
    reserveTopupsSwept,
    cushionTasksSwept,
  });
}

/** Register pg-boss handler on the budgeting-reconciliation queue.
 *
 * `sweepDeps` is optional so the legacy single-arg `registerBudgetingReconciliation(boss)`
 * call still compiles — when omitted, the hourly run does only projection reconcile.
 * worker.ts wires the deps in Phase 7 so the sweeps actually run in prod.
 */
export function registerBudgetingReconciliation(
  boss: PgBossLike,
  sweepDeps?: BudgetingReconciliationSweepDeps,
): void {
  boss.work("budgeting-reconciliation", async () => {
    return runBudgetingReconciliation(undefined, sweepDeps);
  });
}
