/**
 * budgeting-reconciliation.ts — Hourly cron for ENGR-14 projection drift checks (Plan 02-09).
 *
 * Schedule: 0 * * * * UTC.
 * Algorithm:
 *   1. SELECT DISTINCT tenant_id from budgeting.accounts (via withInfraTx — no RLS needed for scan)
 *   2. Per tenant: call reconcileProjections({tenantId, monthStart=2 months ago, monthEnd=current})
 *      under withTenantTx(tenantId, SYSTEM_USER).
 *
 * Returns { tenantsScanned, totalRepaired, totalAlerted } for observability.
 *
 * System user sentinel: 00000000-0000-0000-0000-000000000001 (D-05-g).
 *
 * Per-tenant tx is short (3-month window aggregate); 100s of tenants × 0.1s ≈ manageable.
 * Defer scaling concern to Phase 6 (T-2-09-06).
 */
import { sql } from "drizzle-orm";
import { withInfraTx } from "@budget/platform";
import { ok, type Result } from "@budget/shared-kernel";
import { Temporal } from "temporal-polyfill";
import { reconcileProjections } from "@budget/budgeting/src/application/reconcile-projections";

interface PgBossLike {
  work(queue: string, handler: (job: unknown) => Promise<unknown>): Promise<void>;
}

interface ReconciliationOutput {
  tenantsScanned: number;
  totalChecked: number;
  totalRepaired: number;
  totalAlerted: number;
}

/**
 * Computes [monthStart=first day of (today - 2 months), monthEnd=last day of current month].
 */
function rollingThreeMonthWindow(today: Temporal.PlainDate): { monthStart: string; monthEnd: string } {
  const start = today.subtract({ months: 2 }).with({ day: 1 });
  const end = today.with({ day: today.daysInMonth });
  return { monthStart: start.toString(), monthEnd: end.toString() };
}

/** Core handler logic — exported for direct testing. */
export async function runBudgetingReconciliation(
  todayOverride?: string,
): Promise<Result<ReconciliationOutput, Error>> {
  const today = todayOverride
    ? Temporal.PlainDate.from(todayOverride)
    : Temporal.Now.plainDateISO();
  const { monthStart, monthEnd } = rollingThreeMonthWindow(today);

  // Step 1: collect distinct tenants (worker_role, no RLS — accounts is GRANT-restricted)
  const tenantsResult = await withInfraTx(async (tx) => {
    const drizzleTx = tx as { execute: (q: unknown) => Promise<{ rows: Record<string, unknown>[] }> };
    const r = await drizzleTx.execute(sql`
      SELECT DISTINCT tenant_id FROM budgeting.accounts
    `);
    return r.rows as Array<{ tenant_id: string }>;
  });

  if (tenantsResult.isErr()) return tenantsResult as unknown as Result<ReconciliationOutput, Error>;
  const tenants = tenantsResult.value;

  let totalChecked = 0;
  let totalRepaired = 0;
  let totalAlerted = 0;

  // Step 2: per-tenant reconcile (each call wraps its own withTenantTx(SYSTEM_USER))
  const reconcile = reconcileProjections();
  for (const { tenant_id } of tenants) {
    const r = await reconcile({ tenantId: tenant_id, monthStart, monthEnd });
    if (r.isOk()) {
      totalChecked += r.value.checked;
      totalRepaired += r.value.repaired;
      totalAlerted += r.value.alerted;
    } else {
      // eslint-disable-next-line no-console
      console.error(`[budgeting-reconciliation] tenant=${tenant_id} err:`, r.error);
    }
  }

  // eslint-disable-next-line no-console
  console.log(
    `[budgeting-reconciliation] scanned=${tenants.length} checked=${totalChecked} repaired=${totalRepaired} alerted=${totalAlerted} window=${monthStart}..${monthEnd}`,
  );

  return ok({
    tenantsScanned: tenants.length,
    totalChecked,
    totalRepaired,
    totalAlerted,
  });
}

/** Register pg-boss handler on the budgeting-reconciliation queue. */
export function registerBudgetingReconciliation(boss: PgBossLike): void {
  boss.work("budgeting-reconciliation", async () => {
    return runBudgetingReconciliation();
  });
}
