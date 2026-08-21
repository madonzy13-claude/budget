import type { FxProvider } from "@budget/shared-kernel";
import type { FxRateCacheRepo } from "../../ports/fx-rate-cache-repo";
import { NoFxRateAvailable } from "./frankfurter";
import { formatDateUTC } from "./format-date-utc";

/**
 * CacheOnlyFxProvider — reads budgeting.fx_rates and NOTHING else.
 *
 * The API must never make a live FX call. FrankfurterFxProvider falls back to
 * https://api.frankfurter.dev on a cache miss, and boot.ts passed that provider
 * into every API use case, so a user request could block on a third party —
 * with a per-request cost measured in hundreds of milliseconds when it happened
 * during a page-load burst.
 *
 * Division of labour: the worker fetches hourly and writes rates; the API only
 * reads them. This provider deliberately takes no fetch function, so the
 * cache-only property is structural rather than a matter of configuration.
 *
 * Freshness rules match FrankfurterFxProvider so responses do not change shape:
 *   exact hit          → isStale = weekend || storedDate !== requestedDate
 *   miss + prior rate  → isStale = true
 *   nothing at all     → throw (never fabricate a rate; a silent 1 books a
 *                        foreign amount at par, a bug this codebase has already
 *                        paid for once)
 */
export class CacheOnlyFxProvider implements FxProvider {
  constructor(private readonly cache: FxRateCacheRepo) {}

  async rateAsOf(
    from: string,
    to: string,
    date: Date,
  ): Promise<{ rate: string; provider: string; isStale: boolean }> {
    if (from === to) {
      return { rate: "1", provider: "cache", isStale: false };
    }

    const yyyymmdd = formatDateUTC(date);
    const weekend = isWeekendUTC(date);

    const cached = await this.cache.lookup(from, to, yyyymmdd);
    if (cached) {
      return {
        rate: cached.rate,
        provider: "cache",
        isStale: weekend || cached.date !== yyyymmdd,
      };
    }

    const prior = await this.cache.mostRecentPrior(from, to, yyyymmdd);
    if (prior) {
      return { rate: prior.rate, provider: "cache", isStale: true };
    }

    throw new NoFxRateAvailable(from, to, yyyymmdd);
  }
}

function isWeekendUTC(date: Date): boolean {
  const day = date.getUTCDay();
  return day === 0 || day === 6;
}
