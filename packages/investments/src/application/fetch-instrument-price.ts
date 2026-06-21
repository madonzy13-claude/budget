import { ok, err, type Result } from "neverthrow";
import type { Pool } from "pg";
import type { PriceProvider, ProviderId } from "../ports/price-provider";
import type { InstrumentRepo } from "../ports/instrument-repo";
import type { PriceCacheRepo } from "../ports/price-cache-repo";

/** The on-add instant fetch hit the per-user/minute cap (INV-14 / T-9-16). */
export class RateLimited extends Error {
  constructor() {
    super("rate_limited");
    this.name = "RateLimited";
  }
}

const RATE_LIMIT = 10;

/**
 * On-add instant price fetch, rate-limited to 10/user/min via the server-side
 * atomic counter budgeting.api_rate_limits (table from 09-01 migration 0038).
 * The 11th call in a minute returns RateLimited (no provider call). A provider
 * failure surfaces as an error so the add is BLOCKED (A2) rather than saved
 * with no price.
 */
export function fetchInstrumentPrice(deps: {
  pool: Pool;
  priceProvider: PriceProvider;
  instrumentRepo: InstrumentRepo;
  priceCacheRepo: PriceCacheRepo;
}) {
  return async (input: {
    instrumentId: string;
    userId: string;
  }): Promise<Result<{ price: string; currency: string }, Error>> => {
    try {
      // Pitfall 4 / T-9-16: atomic per-user/minute counter, server-side.
      const r = await deps.pool.query<{ count: number }>(
        `INSERT INTO budgeting.api_rate_limits (user_id, window_min, count)
         VALUES ($1::uuid, date_trunc('minute', now()), 1)
         ON CONFLICT (user_id, window_min)
         DO UPDATE SET count = budgeting.api_rate_limits.count + 1
         RETURNING count`,
        [input.userId],
      );
      const count = Number(r.rows[0]?.count ?? 1);
      if (count > RATE_LIMIT) return err(new RateLimited());

      const inst = await deps.instrumentRepo.findById(input.instrumentId);
      if (!inst) return err(new Error("not_found"));

      const quote = await deps.priceProvider.currentPrice(
        inst.symbol,
        inst.provider as ProviderId,
        { context: "daily" },
      );
      const currency = inst.quoteCurrency ?? quote.currency;
      await deps.priceCacheRepo.upsert(
        input.instrumentId,
        quote.price,
        currency,
      );
      return ok({ price: quote.price, currency });
    } catch (e) {
      return err(e as Error);
    }
  };
}
