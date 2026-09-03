/**
 * budget-wealth-snapshot-3h handler — Phase 11 (D-04, SC8).
 *
 * Every ≤3h, snapshot each budget's wealth so the Overview wealth series has
 * history. For each budget it computes {capitalization_cents, investment_value_cents}
 * in the budget default_currency via the SHARED computeBudgetWealthNow primitive
 * (11-03) — identical numbers to the capitalization card and the wealth live point —
 * and writes ONE idempotent row into budgeting.budget_wealth_snapshots (11-01).
 *
 * Tenant safety (T-11-02): withInfraTx is used ONLY to scan DISTINCT budget ids
 * (no row data). The compute reads under its repos' own per-tenant withTenantTx,
 * and the INSERT runs inside withTenantTx(TenantId(budgetId), UserId(SYSTEM_USER))
 * so the RLS GUC app.tenant_ids is scoped to that one tenant — never a bulk
 * cross-tenant write. Mirrors budgeting-reconciliation.ts.
 *
 * Idempotency: ON CONFLICT on the (budget_id, date_trunc('hour', captured_at AT
 * TIME ZONE 'UTC')) bucket index (0049) DO NOTHING — a same-hour re-run no-ops.
 */
import { sql } from "drizzle-orm";
import { withInfraTx, withTenantTx, isDemoTenantId } from "@budget/platform";
import { TenantId, UserId } from "@budget/shared-kernel";
import {
  computeBudgetWealthNow,
  type ComputeBudgetWealthNowDeps,
} from "@budget/budgeting/src/application/compute-budget-wealth-now";

const SYSTEM_USER_ID = "00000000-0000-0000-0000-000000000001";

interface PgBossLike {
  work(
    queue: string,
    handler: (job: unknown) => Promise<unknown>,
  ): Promise<void>;
}

type DrizzleTx = {
  execute: (q: unknown) => Promise<{ rows: Record<string, unknown>[] }>;
};

export async function runBudgetWealthSnapshot3h(
  deps: ComputeBudgetWealthNowDeps,
): Promise<{ scanned: number; inserted: number }> {
  const computeWealthNow = computeBudgetWealthNow(deps);

  // Scan ALL budgets (no row data) — capitalization is meaningful even with zero
  // investments. worker_role, no RLS needed for the id scan.
  const scan = await withInfraTx(async (tx) => {
    // v1.1: budget_id === tenant_id — tenancy.budgets has no separate tenant_id
    // column; the budget id IS the tenant id.
    const r = await (tx as DrizzleTx).execute(sql`
      SELECT id AS budget_id, id AS tenant_id, default_currency
        FROM tenancy.budgets
    `);
    return r.rows as Array<{
      budget_id: string;
      tenant_id: string;
      default_currency: string;
    }>;
  });
  const scanned = scan.isOk() ? scan.value : [];

  // Demo budgets are EXCLUDED. Their whole wealth history is written by the
  // nightly refresh, scaled by that night's factor. If this job also wrote
  // snapshots between refreshes, the series would mix two factors and the chart
  // would show a cliff that never happened — the reported "-44% since
  // yesterday", which was an artefact of the re-roll, not a change in anyone's
  // money.
  const budgets = scanned.filter((b) => !isDemoTenantId(b.tenant_id));

  let inserted = 0;
  const now = new Date();
  for (const b of budgets) {
    try {
      const wealth = await computeWealthNow({
        budgetId: b.budget_id,
        tenantId: b.tenant_id,
        defaultCurrency: b.default_currency,
        now,
      });
      const writeR = await withTenantTx(
        TenantId(b.tenant_id),
        UserId(SYSTEM_USER_ID),
        async (tx) => {
          // A budget created today, with its wallets added tomorrow, spends the
          // gap being recorded once an hour as worth nothing — and the wealth
          // chart draws that literally: a cliff to zero between whatever history
          // it was seeded with and its first real reading (user, 260810, 22 such
          // rows on one budget). Those zeros were TRUE and still meaningless:
          // nobody had put anything in yet.
          //
          // So a budget with no wallet AT ALL has nothing to plot and is not
          // plotted. The test is deliberately the existence of a wallet, not the
          // total: a household whose wallets really do sum to zero is making a
          // statement about its money, and that one still gets recorded.
          //
          // Checked only when there is nothing to write anyway, so the ordinary
          // path costs no extra query — and inside this tx, where the tenant GUC
          // is set (the id scan above runs under withInfraTx with no GUC, so an
          // EXISTS there would be blocked by RLS and skip EVERY budget).
          if (
            wealth.capitalization_cents === 0n &&
            wealth.investment_value_cents === 0n
          ) {
            const w = await (tx as DrizzleTx).execute(sql`
              SELECT 1 FROM budgeting.wallets
               WHERE tenant_id = ${b.tenant_id}::uuid
               LIMIT 1
            `);
            if (w.rows.length === 0) return 0;
          }
          const res = await (tx as DrizzleTx).execute(sql`
            INSERT INTO budgeting.budget_wealth_snapshots
              (tenant_id, budget_id, capitalization_cents, investment_value_cents, investment_cost_basis_cents, currency)
            VALUES (
              ${b.tenant_id}::uuid,
              ${b.budget_id}::uuid,
              ${wealth.capitalization_cents.toString()}::bigint,
              ${wealth.investment_value_cents.toString()}::bigint,
              ${wealth.investment_cost_basis_cents.toString()}::bigint,
              ${wealth.currency}
            )
            ON CONFLICT (budget_id, (date_trunc('hour', captured_at AT TIME ZONE 'UTC')))
            DO NOTHING
            RETURNING id
          `);
          return res.rows.length; // 0 when the hour-bucket row already existed
        },
      );
      if (writeR.isErr()) throw writeR.error;
      inserted += writeR.value;
    } catch (e) {
      // One budget's failure must not abort the batch (mirrors the daily handler).
      console.error(
        `[budget-wealth-snapshot-3h] budget=${b.budget_id} err:`,
        e,
      );
    }
  }

  console.log(
    `[budget-wealth-snapshot-3h] scanned=${budgets.length} inserted=${inserted}`,
  );
  return { scanned: budgets.length, inserted };
}

export function registerBudgetWealthSnapshot3h(
  boss: PgBossLike,
  deps: ComputeBudgetWealthNowDeps,
): void {
  boss.work("budget-wealth-snapshot-3h", async () =>
    runBudgetWealthSnapshot3h(deps),
  );
}
