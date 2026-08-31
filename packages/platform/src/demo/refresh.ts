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
import type { Pool, PoolClient } from "pg";
import { checkManifest } from "./preflight";
import { demoManifest } from "./manifest";
import { refreshPair } from "./copy";
import { readDemoConfig, scaleForPair, type DemoConfig } from "./config";

/**
 * Each demo account's display currency follows its own PERSONAL budget, so a
 * Ukrainian visitor sees hryvnia everywhere the app totals across budgets and a
 * Polish one sees złoty.
 *
 * Done here rather than left to provisioning: a fresh deployment should end up
 * correct from the first refresh, not depend on someone remembering a one-off
 * UPDATE. identity.users is USER-SCOPED under RLS, and the copy has already set
 * app.current_user_id to the demo user, so this is a self-update — the same
 * thing the account could do from its own settings page.
 */
async function setAccountCurrencies(
  client: PoolClient,
  cfg: DemoConfig,
): Promise<void> {
  for (const [locale, userId] of Object.entries(cfg.userByLocale)) {
    const currency = cfg.accountCurrencyByLocale[locale];
    if (!currency) continue;
    await client.query(`SELECT set_config('app.current_user_id', $1, true)`, [
      userId,
    ]);
    await client.query(
      `UPDATE identity.users SET display_currency = $2 WHERE id = $1::uuid`,
      [userId, currency],
    );
  }
}

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
      counts[pair.label] = await refreshPair(client, { ...pair, moneyScale });
    }
    await setAccountCurrencies(client, cfg);
    await client.query("COMMIT");
    return { ok: true, scales, counts };
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}
