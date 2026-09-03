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
import { readDemoConfig, scaleForPair, type DemoConfig } from "./config";

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
  scales: Record<string, number>;
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
      // Resolved ONCE per budget and threaded through every table of it —
      // resolving per table would break the uniformity the arithmetic needs.
      // This is only the STARTING factor: an anchored budget is measured after
      // the commit and re-copied once at the corrected factor, because the
      // measurement needs the app's own valuation of committed rows.
      const moneyScale = scaleForPair(pair);
      scales[pair.label] = moneyScale;
      counts[pair.label] = await refreshPair(client, { ...pair, moneyScale });
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
      const measure = () =>
        computeLiveWealth({
          budgetId: pair.dest,
          tenantId: pair.dest,
          defaultCurrency: pair.currency,
        });

      let live = await measure();

      // Anchoring: capitalization is LINEAR in the money factor, so one
      // measurement gives the exact correction. Re-copying is the only way to
      // apply it — every money column has to move — but it converges in a
      // single step rather than drifting toward the target over nights.
      if (pair.anchor) {
        const capMajor = Number(live.capitalizationCents) / 100;
        if (capMajor > 0) {
          const corrected = scales[pair.label]! * (pair.anchor / capMajor);
          const off = Math.abs(capMajor - pair.anchor) / pair.anchor;
          if (off > 0.005 && Number.isFinite(corrected) && corrected > 0) {
            const c2 = await pool.connect();
            try {
              await c2.query("BEGIN");
              counts[pair.label] = await refreshPair(c2, {
                ...pair,
                moneyScale: corrected,
              });
              await c2.query("COMMIT");
            } catch (e) {
              await c2.query("ROLLBACK");
              throw e;
            } finally {
              c2.release();
            }
            scales[pair.label] = corrected;
            live = await measure();
          }
        }
      }

      // History levelled onto that same measurement, so the chart's newest
      // point and the capitalization card are the SAME number by construction.
      const c3 = await pool.connect();
      try {
        await c3.query("BEGIN");
        await levelWealthHistory(c3, { ...pair, moneyScale: 1 }, live);
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
