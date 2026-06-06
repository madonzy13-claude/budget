import type { Currency } from "../money";

export interface FxProvider {
  rateAsOf(
    from: Currency,
    to: Currency,
    date: Date,
  ): Promise<{ rate: string; provider: string; isStale: boolean }>;
}

/**
 * Thrown when InMemoryFxProvider is asked for a cross-currency rate it was not
 * explicitly seeded with. Guards against the stub silently returning rate 1 and
 * leaking UNCONVERTED foreign-currency amounts into a write path (e.g. the
 * recurring draft engine). See scripts/backfill-recurring-draft-fx.ts (05-21):
 * the original `?? '1'` fallback produced rate-1 "3500 PLN as 3500 EUR" drafts.
 */
export class InMemoryFxRateNotConfigured extends Error {
  constructor(
    public readonly from: string,
    public readonly to: string,
  ) {
    super(
      `InMemoryFxProvider has no rate for ${from}->${to}. ` +
        `Seed an explicit rate (new InMemoryFxProvider({ '${from}->${to}': '<rate>' })) ` +
        `— the stub refuses to fabricate a cross-currency rate of 1.`,
    );
    this.name = "InMemoryFxRateNotConfigured";
  }
}

export class InMemoryFxProvider implements FxProvider {
  constructor(private readonly fixed: Record<string, string> = {}) {}

  async rateAsOf(
    from: Currency,
    to: Currency,
    _date: Date,
  ): Promise<{ rate: string; provider: string; isStale: boolean }> {
    if (from === to) {
      return { rate: "1", provider: "in-memory", isStale: false };
    }
    const key = `${from}->${to}`;
    const explicit = this.fixed[key];
    if (explicit === undefined) {
      // No silent rate-1 fallback for cross-currency: a faked 1 stored as a real
      // conversion is the exact bug this stub used to cause. Force the caller to
      // either seed a rate or use a real provider.
      throw new InMemoryFxRateNotConfigured(from, to);
    }
    return {
      rate: explicit,
      provider: "in-memory",
      isStale: false,
    };
  }
}
