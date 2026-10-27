/**
 * fx-memo.ts — one memoized rate lookup per booking (from → to as of a date).
 * A booking asks for the same pair several times (cost, realized, value); one
 * provider call each. A missing rate is FxUnavailableError → 422 fx_unavailable.
 */
import type { FxProvider } from "@budget/shared-kernel";

export class FxUnavailableError extends Error {
  constructor(
    public readonly currency: string,
    public readonly date: string,
  ) {
    super("fx_unavailable");
  }
}

export function makeRate(fx: FxProvider, date: string) {
  const memo = new Map<string, Promise<string>>();
  return (from: string, to: string): Promise<string> => {
    if (from === to) return Promise.resolve("1");
    const k = `${from}>${to}`;
    let p = memo.get(k);
    if (!p) {
      p = fx
        .rateAsOf(from as never, to as never, new Date(`${date}T00:00:00Z`))
        .then((r) => r.rate)
        .catch(() => {
          throw new FxUnavailableError(from, date);
        });
      memo.set(k, p);
    }
    return p;
  };
}
