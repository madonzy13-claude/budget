/**
 * investment-snapshot-daily handler — Phase 9 (INV-15 / D-30).
 * Daily pg-boss job (after fx-daily-fetch):
 *   1. Append one price snapshot per held instrument per day from the price cache
 *      (ON CONFLICT (instrument_id, snapshot_date) DO NOTHING — exactly one/day).
 *   2. Ensure the day's fx_rates cover the held investment currencies: collect the
 *      DISTINCT held buy/current currencies vs the EUR anchor and call
 *      fxProvider.rateAsOf (which caches into budgeting.fx_rates). EXTENDS the
 *      existing daily-FX pair collection — no new FX table/job (D-30).
 *
 * Reference-data + cross-tenant scope: withInfraTx (worker_role); held-set reads use
 * investments_worker_cron_scan.
 */
import type { FxProvider } from "@budget/shared-kernel";
import { withInfraTx } from "@budget/platform";
import { sql } from "drizzle-orm";

const ANCHOR = "EUR";

interface PgBossLike {
  work(
    queue: string,
    handler: (job: unknown) => Promise<unknown>,
  ): Promise<void>;
}

export async function runInvestmentSnapshotDaily(
  fxProvider: FxProvider,
): Promise<{ snapshots: number; fxPairs: number }> {
  // 1. One snapshot per held instrument per day from the cache.
  const snapR = await withInfraTx(async (tx) => {
    const res = await tx.execute(sql`
      INSERT INTO budgeting.instrument_price_snapshots (instrument_id, snapshot_date, price, currency)
      SELECT c.instrument_id, CURRENT_DATE, c.price, c.currency
        FROM budgeting.instrument_price_cache c
       WHERE c.instrument_id IN (
         SELECT DISTINCT inv.instrument_id
           FROM budgeting.investments inv
          WHERE inv.archived_at IS NULL AND inv.instrument_id IS NOT NULL
       )
      ON CONFLICT (instrument_id, snapshot_date) DO NOTHING
      RETURNING instrument_id
    `);
    return res.rows.length;
  });
  const snapshots = snapR.isOk() ? snapR.value : 0;

  // 2. Held currencies (buy + current) vs the EUR anchor → fxProvider.rateAsOf.
  const ccyR = await withInfraTx(async (tx) => {
    const res = await tx.execute(sql`
      SELECT DISTINCT ccy FROM (
        SELECT buy_currency AS ccy FROM budgeting.investments
          WHERE archived_at IS NULL AND buy_currency IS NOT NULL
        UNION
        SELECT current_price_currency AS ccy FROM budgeting.investments
          WHERE archived_at IS NULL AND current_price_currency IS NOT NULL
      ) s
      WHERE ccy <> ${ANCHOR}
    `);
    return res.rows as unknown as Array<{ ccy: string }>;
  });
  const currencies = ccyR.isOk() ? ccyR.value.map((r) => r.ccy) : [];

  const today = new Date();
  let fxPairs = 0;
  type FxArg = Parameters<typeof fxProvider.rateAsOf>[0];
  for (const ccy of currencies) {
    try {
      await fxProvider.rateAsOf(ccy as FxArg, ANCHOR as FxArg, today);
      fxPairs++;
    } catch {
      // A missing rate is non-fatal — the snapshot still landed.
    }
  }

  return { snapshots, fxPairs };
}

export function registerInvestmentSnapshotDaily(
  boss: PgBossLike,
  fxProvider: FxProvider,
) {
  boss.work("investment-snapshot-daily", async () =>
    runInvestmentSnapshotDaily(fxProvider),
  );
}
