/**
 * instrument-price-hourly handler — Phase 9 (INV-13 / T-9-10).
 * Hourly pg-boss job. Fetches a live price for the DISTINCT set of held, tracked,
 * auto-priced instruments across ALL tenants in ONE query (no per-tenant iteration)
 * and upserts budgeting.instrument_price_cache. This covers crypto (coingecko),
 * US stocks/ETFs (finnhub) AND metals (gold_api) — all carry refresh_cadence='hourly'.
 * Excludes only: custom holdings (instrument_id NULL), manual-priced instruments
 * (provider LIKE 'manual%', user-maintained), and any refresh_cadence='daily' rows
 * (the daily gate is retained but currently unused — no instrument is 'daily').
 * Returns { fetched, failed }.
 *
 * Reference-data scope: withInfraTx (worker_role). The cross-tenant held-set read is
 * permitted by the investments_worker_cron_scan SELECT policy (post-migration).
 */
import type {
  PriceProvider,
  ProviderId,
} from "@budget/investments/src/ports/price-provider";
import { withInfraTx } from "@budget/platform";
import { sql } from "drizzle-orm";

interface PgBossLike {
  work(
    queue: string,
    handler: (job: unknown) => Promise<unknown>,
  ): Promise<void>;
}

interface HeldInstrument {
  id: string;
  symbol: string;
  price_provider: string;
}

export async function runInstrumentPriceHourly(
  priceProvider: PriceProvider,
): Promise<{ fetched: number; failed: number; failedSymbols: string[] }> {
  const heldR = await withInfraTx(async (tx) => {
    const rows = await tx.execute(sql`
      SELECT DISTINCT i.id::text AS id, i.symbol, i.provider AS price_provider
        FROM budgeting.investments inv
        JOIN budgeting.instruments i ON i.id = inv.instrument_id
       WHERE inv.archived_at IS NULL
         AND inv.instrument_id IS NOT NULL
         AND i.active = true
         AND i.refresh_cadence <> 'daily'
         -- 9.2: manual-priced instruments (non-US equities/ETF) are user-maintained;
         -- never auto-fetched. The sentinel is 'manual', exchange-qualified as
         -- 'manual:<MIC>', so exclude the whole family. Everything else routes
         -- through a real PriceProvider.
         AND i.provider NOT LIKE 'manual%'
    `);
    return rows.rows as unknown as HeldInstrument[];
  });
  const held = heldR.isOk() ? heldR.value : [];

  let fetched = 0;
  let failed = 0;
  const failedSymbols: string[] = [];
  const errorSamples: string[] = [];
  for (const inst of held) {
    try {
      const quote = await priceProvider.currentPrice(
        inst.symbol,
        inst.price_provider as ProviderId,
        { context: "hourly" },
      );
      const up = await withInfraTx(async (tx) => {
        await tx.execute(sql`
          INSERT INTO budgeting.instrument_price_cache (instrument_id, price, currency, fetched_at)
          VALUES (${inst.id}::uuid, ${quote.price}::numeric, ${quote.currency}, now())
          ON CONFLICT (instrument_id) DO UPDATE SET
            price = EXCLUDED.price, currency = EXCLUDED.currency, fetched_at = now()
        `);
      });
      if (up.isErr()) throw up.error;
      fetched++;
    } catch (e) {
      // T-9-10: one bad symbol/provider must not abort the whole sweep. But record
      // WHICH ones fail — silent swallowing made a provider outage look like the
      // cron "not running" (prices froze, net worth flat, no signal). A few samples
      // keep the log bounded when many fail at once (rate-limit).
      failed++;
      failedSymbols.push(inst.symbol);
      if (errorSamples.length < 5) {
        errorSamples.push(
          `${inst.symbol}/${inst.price_provider}: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    }
  }
  console.log(
    `[instrument-price-hourly] fetched=${fetched} failed=${failed} held=${held.length}`,
  );
  if (failed > 0) {
    console.warn(
      `[instrument-price-hourly] ${failed} price fetch(es) failed; samples: ${errorSamples.join(" | ")}`,
    );
  }
  return { fetched, failed, failedSymbols };
}

export function registerInstrumentPriceHourly(
  boss: PgBossLike,
  priceProvider: PriceProvider,
) {
  boss.work("instrument-price-hourly", async () =>
    runInstrumentPriceHourly(priceProvider),
  );
}
