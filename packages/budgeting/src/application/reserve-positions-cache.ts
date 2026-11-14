import { AsyncLocalStorage } from "node:async_hooks";

type Input = { tenantId: string; budgetId: string; month?: string };

/**
 * Read cache for reservePositions (261102). One Overview page load replays the
 * reserve engine ~6 times — cards, planned, overspent, reserve-fit, projection,
 * reserves — ~50ms each on a real budget, and /budgets/aggregate once per
 * budget. Those reads now share one replay.
 *
 * Only inside `readScope` (the API wraps every GET in it). A write request, the
 * worker, anything else replays fresh — adjust-reserve and recompute-topup read
 * positions right after their own write and must see it.
 *
 * `invalidate()` (the API calls it after every non-GET request) bumps an epoch
 * that is part of the key, so a replay still in flight across a write is never
 * served after it. The TTL bounds what the worker's writes can leave stale.
 */
export function cacheReservePositions<I extends Input, R>(
  fn: (input: I) => Promise<R>,
  opts: { ttlMs?: number; now?: () => number } = {},
) {
  const ttlMs = opts.ttlMs ?? 10_000;
  const now = opts.now ?? Date.now;
  const scope = new AsyncLocalStorage<true>();
  const entries = new Map<string, { value: Promise<R>; expiresAt: number }>();
  let epoch = 0;

  return {
    readScope<T>(run: () => Promise<T>): Promise<T> {
      return scope.run(true, run);
    },
    invalidate(): void {
      epoch++;
      entries.clear();
    },
    get(input: I): Promise<R> {
      if (!scope.getStore()) return fn(input);
      const key = `${epoch}|${input.tenantId}|${input.budgetId}|${input.month ?? ""}`;
      const hit = entries.get(key);
      if (hit && hit.expiresAt > now()) return hit.value;
      // ponytail: expired keys are only dropped on invalidate or overwrite; the
      // key space is one entry per budget(+month), so it stays small.
      const value = fn(input);
      entries.set(key, { value, expiresAt: now() + ttlMs });
      value.catch(() => entries.delete(key));
      return value;
    },
  };
}
