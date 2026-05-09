export interface FxRateCacheRepo {
  lookup(
    base: string,
    quote: string,
    date: string /* YYYY-MM-DD */,
  ): Promise<{ rate: string; date: string } | null>;

  upsert(
    base: string,
    quote: string,
    date: string,
    rate: string,
    provider: string,
  ): Promise<void>;

  mostRecentPrior(
    base: string,
    quote: string,
    beforeDate: string,
  ): Promise<{ rate: string; date: string } | null>;
}
