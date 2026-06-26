import Big from "big.js";
import { ok, err, type Result } from "neverthrow";
import type { Pool } from "pg";
import type { FxProvider } from "@budget/shared-kernel";
import type { PriceProvider, ProviderId } from "../ports/price-provider";
import { type InstrumentRepo, isManualProvider } from "../ports/instrument-repo";
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
 * Serve a cached price without a provider call when it's at least this fresh.
 * Aligned to the hourly price-scan cron (PRICE_SCAN_CRON default 0 * * * *): a price
 * this recent is plenty current for the on-add preview, and reusing it means repeated
 * lookups — same instrument, same or another user — don't each spend a shared provider
 * request. The instrument_price_cache is global (no tenant scope), so one fetch covers
 * everyone for the window.
 */
const CACHE_TTL_MS = 60 * 60 * 1000;

/**
 * On-add instant price fetch. Read-through cache FIRST: a price fresh within
 * CACHE_TTL_MS is returned with no provider call and no rate-limit charge. On a
 * cache miss/stale entry, fetch from the provider — rate-limited to 10/user/min
 * via the server-side atomic counter budgeting.api_rate_limits (09-01 migration
 * 0038); the 11th call in a minute returns RateLimited (no provider call). A
 * provider failure surfaces as an error so the add is BLOCKED (A2) rather than
 * saved with no price.
 */
export function fetchInstrumentPrice(deps: {
  pool: Pool;
  priceProvider: PriceProvider;
  instrumentRepo: InstrumentRepo;
  priceCacheRepo: PriceCacheRepo;
  /** Optional: enables FX conversion of the fetched price to a target currency
   *  (used for precious metals, quoted in USD but shown in the user's currency). */
  fxProvider?: FxProvider;
}) {
  /** Convert a raw quote to `targetCurrency` via FX when requested + different. The
   *  cache always stores the RAW (provider) currency, so conversion happens last. */
  const convert = async (
    price: string,
    currency: string,
    targetCurrency?: string,
  ): Promise<{ price: string; currency: string }> => {
    if (!targetCurrency || targetCurrency === currency || !deps.fxProvider) {
      return { price, currency };
    }
    try {
      const { rate } = await deps.fxProvider.rateAsOf(
        currency as never,
        targetCurrency as never,
        new Date(),
      );
      const converted = new Big(price).times(new Big(rate)).toFixed(8);
      return { price: converted, currency: targetCurrency };
    } catch {
      // FX unavailable → fall back to the raw quote rather than blocking the add.
      return { price, currency };
    }
  };

  return async (input: {
    instrumentId: string;
    userId: string;
    /** Convert the fetched price into this currency when set (metals: USD → ccy). */
    targetCurrency?: string;
  }): Promise<Result<{ price: string; currency: string }, Error>> => {
    try {
      const inst = await deps.instrumentRepo.findById(input.instrumentId);
      if (!inst) return err(new Error("not_found"));

      // Manual-priced instruments (non-US equities/ETF, sentinel provider='manual')
      // have no free server-side price source — the user enters the price in the form.
      // Never call a provider or charge the rate limit; the route surfaces this so the
      // form keeps the price field editable instead of showing a blocked banner. Any
      // OTHER provider (incl. test stubs) still routes to the PriceProvider.
      if (isManualProvider(inst.provider))
        return err(new Error("manual_pricing"));

      // Read-through cache: a recent price is served with NO provider call and NO
      // rate-limit charge, so repeated lookups don't exhaust the shared quota.
      const cached = await deps.priceCacheRepo.lookup(input.instrumentId);
      if (cached && Date.now() - cached.fetchedAt.getTime() < CACHE_TTL_MS) {
        return ok(
          await convert(cached.price, cached.currency, input.targetCurrency),
        );
      }

      // Cache miss / stale → charge the per-user/minute counter, then fetch.
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
      return ok(await convert(quote.price, currency, input.targetCurrency));
    } catch (e) {
      return err(e as Error);
    }
  };
}
