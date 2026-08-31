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

export async function handleDemoRefresh(): Promise<void> {
  const cfg = readDemoConfig();
  if (!cfg) {
    // Should be unreachable — the schedule is not registered when unconfigured
    // — but a job that ran anyway must do nothing rather than improvise.
    console.log("[demo-refresh] not configured; skipping");
    return;
  }

  const result = await runDemoRefresh(appPool(), cfg);

  if (!result.ok) {
    // Loud, and NOT an exception: the demo is intentionally left as it was.
    // Failing the job would retry the same doomed copy all night.
    console.error(
      `[demo-refresh] refused to run: ${result.reason}. ` +
        `Yesterday's demo data is intact. Update the scrub manifest.`,
    );
    return;
  }

  const summary = Object.entries(result.counts)
    .map(([label, counts]) => {
      const rows = Object.values(counts).reduce((a, b) => a + b, 0);
      return `${label}=${rows} rows @ x${result.scales[label]?.toFixed(3)}`;
    })
    .join(" ");
  console.log(`[demo-refresh] rebuilt ${summary}`);
}
