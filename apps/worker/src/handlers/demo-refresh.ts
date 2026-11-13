/**
 * demo-refresh.ts — nightly rebuild of the shared demo tenant.
 *
 * Runs at 03:00 UTC. Wipes the demo budgets and re-copies them from the
 * owner's real budgets through the scrub manifest, with a fresh money factor
 * drawn for the night.
 *
 * Uses an APP-role pool, not the worker's own. worker_role holds no write
 * grant on tenancy.* and no DELETE on the append-only expense_ledger; granting
 * those would widen every job in this process rather than just this one.
 * app_role already has exactly these rights and is still NOBYPASSRLS, so tenant
 * isolation is unchanged.
 */
import { appPool, readDemoConfig, runDemoRefresh } from "@budget/platform";
import {
  computeBudgetWealthNow,
  type ComputeBudgetWealthNowDeps,
} from "@budget/budgeting/src/application/compute-budget-wealth-now";

export async function handleDemoRefresh(
  wealthDeps: ComputeBudgetWealthNowDeps,
): Promise<void> {
  const cfg = readDemoConfig();
  if (!cfg) {
    // Should be unreachable — the schedule is not registered when unconfigured
    // — but a job that ran anyway must do nothing rather than improvise.
    console.log("[demo-refresh] not configured; skipping");
    return;
  }

  // The app's OWN valuation, injected. Capitalization is domain logic — live
  // price cache, metals premiums, deposit accrual — and the demo copy has no
  // business re-deriving it. Two earlier attempts to compute it in SQL were
  // both wrong, and the second one is what the user saw as "+21.6% since
  // yesterday": the card and the chart were computing different numbers.
  const computeWealthNow = computeBudgetWealthNow(wealthDeps);
  const result = await runDemoRefresh(appPool(), cfg, async (b) => {
    const w = await computeWealthNow({
      budgetId: b.budgetId,
      tenantId: b.tenantId,
      defaultCurrency: b.defaultCurrency,
      now: new Date(),
    });
    return {
      capitalizationCents: w.capitalization_cents,
      investmentValueCents: w.investment_value_cents,
    };
  });

  if (!result.ok) {
    // The demo is left as it was — and the JOB FAILS. A refusal returned
    // quietly marked the job "completed" and froze the demo for a night
    // unnoticed (261113: 0110 added columns the manifest did not know). A
    // retry only re-runs the read-only preflight, which is cheap.
    throw new Error(
      `[demo-refresh] refused to run: ${result.reason}. ` +
        `Yesterday's demo data is intact. Update the scrub manifest.`,
    );
  }

  const summary = Object.entries(result.counts)
    .map(([label, counts]) => {
      const rows = Object.values(counts).reduce((a, b) => a + b, 0);
      return `${label}=${rows} rows @ x${result.scales[label]?.toFixed(3)}`;
    })
    .join(" ");
  console.log(`[demo-refresh] rebuilt ${summary}`);
}
