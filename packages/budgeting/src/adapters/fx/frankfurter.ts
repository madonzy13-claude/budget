import type { FxProvider } from "@budget/shared-kernel";
import type { FxRateCacheRepo } from "../../ports/fx-rate-cache-repo";
import { formatDateUTC } from "./format-date-utc";

export class NoFxRateAvailable extends Error {
  constructor(
    public from: string,
    public to: string,
    public date: string,
  ) {
    super(`No FX rate available for ${from}/${to} as of ${date}`);
    this.name = "NoFxRateAvailable";
  }
}

/**
 * FrankfurterFxProvider — implements FxProvider port.
 * ENGR-09 ACL: Frankfurter returns `{rate: number}`; we convert to string
 * at the adapter boundary so the number type never crosses into the domain.
 *
 * Algorithm (cache-then-live-then-stale):
 * 1. from === to → {rate:'1', isStale:false}
 * 2. cache hit → return cached; isStale = (cached.date !== requested date)
 * 3. cache miss + live success → cache & return; isStale = (franker date !== requested)
 * 4. live failure → mostRecentPrior fallback; isStale=true; both miss → NoFxRateAvailable
 */
export class FrankfurterFxProvider implements FxProvider {
  constructor(
    private readonly cache: FxRateCacheRepo,
    private readonly fetchFn: typeof fetch = fetch,
  ) {}

  async rateAsOf(
    from: string,
    to: string,
    date: Date,
  ): Promise<{ rate: string; provider: string; isStale: boolean }> {
    if (from === to) {
      return { rate: "1", provider: "frankfurter", isStale: false };
    }

    const yyyymmdd = formatDateUTC(date);

    // Step 2: cache hit
    const cached = await this.cache.lookup(from, to, yyyymmdd);
    if (cached) {
      return {
        rate: cached.rate,
        provider: "frankfurter",
        isStale: cached.date !== yyyymmdd,
      };
    }

    // Step 3: live fetch
    try {
      const r = await this.fetchFn(
        `https://api.frankfurter.dev/v2/rate/${from}/${to}?date=${yyyymmdd}`,
      );
      if (!r.ok) throw new Error(`frankfurter http ${r.status}`);
      const j = (await r.json()) as { date: string; rate: number };
      const rateStr = String(j.rate); // ACL: number → string at boundary (ENGR-09)
      await this.cache.upsert(from, to, j.date, rateStr, "frankfurter");
      return {
        rate: rateStr,
        provider: "frankfurter",
        isStale: j.date !== yyyymmdd,
      };
    } catch {
      // Step 4: fallback to most recent prior cached rate
      const fallback = await this.cache.mostRecentPrior(from, to, yyyymmdd);
      if (!fallback) throw new NoFxRateAvailable(from, to, yyyymmdd);
      return { rate: fallback.rate, provider: "frankfurter", isStale: true };
    }
  }
}
