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
import { refreshPair, levelWealthHistory } from "./copy";
import { readDemoConfig, type DemoConfig, type DemoPair } from "./config";

/**
 * Each demo account's display currency follows its own PERSONAL budget, so a
 * Ukrainian visitor sees hryvnia everywhere the app totals across budgets.
 *
 * Done here rather than left to provisioning: a fresh deployment should be
 * correct from the first refresh. identity.users is USER-SCOPED under RLS and
 * the copy has already set app.current_user_id, so this is a self-update.
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

/**
 * The rate each relabelled currency converts at (newest stored, inverted when
 * only the reverse pair is stored). No rate → the whole refresh fails and
 * yesterday's demo stays: a relabel without its rate is exactly what made the
 * demo ~9× off (261113).
 */
async function fxMultipliers(
  client: PoolClient,
  pair: DemoPair,
): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const [from, to] of Object.entries(pair.currencyMap)) {
    if (from === to) continue;
    const { rows } = await client.query<{ rate: string }>(
      `SELECT rate::text FROM (
         SELECT rate, date FROM budgeting.fx_rates WHERE base = $1 AND quote = $2
         UNION ALL
         SELECT 1 / rate, date FROM budgeting.fx_rates WHERE base = $2 AND quote = $1
       ) r ORDER BY date DESC LIMIT 1`,
      [from, to],
    );
    const rate = Number(rows[0]?.rate);
    if (!(rate > 0)) throw new Error(`demo refresh: no ${from}→${to} rate`);
    out[from] = rate;
  }
  return out;
}

/**
 * The app's own valuation of a budget, injected by the caller.
 *
 * A PORT, not a query. Capitalization is domain logic — live price cache,
 * metals premiums, deposit accrual — and this module got it wrong twice by
 * re-deriving it in SQL. The worker passes compute-budget-wealth-now; nothing
 * here is allowed to have its own opinion about what a budget is worth.
 */
export type ComputeLiveWealth = (args: {
  budgetId: string;
  tenantId: string;
  defaultCurrency: string;
}) => Promise<{ capitalizationCents: bigint; investmentValueCents: bigint }>;

export type RefreshResult = {
  ok: boolean;
  reason?: string;
  scales: Record<string, { flow: number; wealth: number }>;
  counts: Record<string, Record<string, number>>;
};

/**
 * @param pool an APP-role pool. worker_role cannot do this work: it holds no
 *   write grant on tenancy.* and no DELETE on the append-only expense_ledger,
 *   and granting those would widen every job in the worker, not just this one.
 */
export async function runDemoRefresh(
  pool: Pool,
  cfg: DemoConfig | null = readDemoConfig(),
  computeLiveWealth?: ComputeLiveWealth,
): Promise<RefreshResult> {
  const scales: RefreshResult["scales"] = {};
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
      scales[pair.label] = { flow: pair.flowScale, wealth: pair.wealthScale };
      counts[pair.label] = await refreshPair(client, {
        ...pair,
        fxMultipliers: await fxMultipliers(client, pair),
      });
    }
    await setAccountCurrencies(client, cfg);
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }

  // ── After the copy has COMMITTED ─────────────────────────────────────────
  // Everything below needs the app's own valuation of the copied data, and
  // that reads through its own connection — it cannot see uncommitted rows.
  if (computeLiveWealth) {
    for (const pair of cfg.pairs) {
      const live = await computeLiveWealth({
        budgetId: pair.dest,
        tenantId: pair.dest,
        defaultCurrency: pair.currency,
      });

      // History levelled onto that same measurement, so the chart's newest
      // point and the capitalization card are the SAME number by construction.
      const c3 = await pool.connect();
      try {
        await c3.query("BEGIN");
        await levelWealthHistory(c3, pair, live);
        await c3.query("COMMIT");
      } catch (e) {
        await c3.query("ROLLBACK");
        throw e;
      } finally {
        c3.release();
      }
    }
  }

  return { ok: true, scales, counts };
}
