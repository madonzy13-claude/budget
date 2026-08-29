/**
 * refresh.ts — the whole nightly job, as one function.
 *
 * The ordering here is the safety argument, so it is worth stating plainly:
 *
 *   preflight (READ ONLY)  →  abort on any schema drift, having changed nothing
 *   BEGIN
 *     per pair: id map → wipe → copy → membership
 *   COMMIT
 *
 * The preflight runs first and outside the write path, so a schema change
 * leaves the previous night's demo exactly as it was — visible and correct,
 * merely stale. Every write is in one transaction, so a mid-run failure cannot
 * leave a half-scrubbed demo standing.
 */
import type { Pool } from "pg";
import { checkManifest } from "./preflight";
import { demoManifest } from "./manifest";
import { refreshPair } from "./copy";
import { readDemoConfig, scaleForPair, type DemoConfig } from "./config";

export type RefreshResult = {
  ok: boolean;
  reason?: string;
  scales: Record<string, number>;
  counts: Record<string, Record<string, number>>;
};

/**
 * @param pool an APP-role pool. worker_role cannot do this work: it holds no
 *   write grant on tenancy.* and no DELETE on the append-only expense_ledger,
 *   and granting those would widen every job in the worker, not just this one.
 * @param day  "YYYY-MM-DD" — the day whose money factor to use. Passed in
 *   rather than read from the clock so a run is reproducible and testable.
 */
export async function runDemoRefresh(
  pool: Pool,
  day: string,
  cfg: DemoConfig | null = readDemoConfig(),
): Promise<RefreshResult> {
  const scales: Record<string, number> = {};
  const counts: Record<string, Record<string, number>> = {};

  if (!cfg) {
    return { ok: false, reason: "demo not configured", scales, counts };
  }

  // ── Preflight, before anything is touched ────────────────────────────────
  const findings = await checkManifest(pool, demoManifest);
  if (findings.length > 0) {
    // Deliberately NOT a partial run. Yesterday's demo stays up.
    return {
      ok: false,
      reason:
        `manifest out of date; refusing to copy. ` +
        findings.map((f) => JSON.stringify(f)).join(" "),
      scales,
      counts,
    };
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const pair of cfg.pairs) {
      // Resolved ONCE per pair and threaded through every table of that pair —
      // resolving per table would break the uniformity the arithmetic needs.
      const moneyScale = scaleForPair(cfg, pair, day);
      scales[pair.label] = moneyScale;
      counts[pair.label] = await refreshPair(client, {
        ...pair,
        moneyScale,
        demoUserId: cfg.demoUserId,
      });
    }
    await client.query("COMMIT");
    return { ok: true, scales, counts };
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}
