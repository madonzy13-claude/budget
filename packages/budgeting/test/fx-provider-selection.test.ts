import { describe, test, expect } from "bun:test";
import { createBudgetingModule } from "../src/contracts/factory";
import { CacheOnlyFxProvider } from "../src/adapters/fx/cache-only";
import { FrankfurterFxProvider } from "../src/adapters/fx/frankfurter";
import type { FxRateCacheRepo } from "../src/ports/fx-rate-cache-repo";

/**
 * Which FX provider each process gets is a security/latency boundary, not a
 * detail: FrankfurterFxProvider fetches https://api.frankfurter.dev on a cache
 * miss. The factory feeds every API use case, so the DEFAULT must be the one
 * that cannot reach the network.
 */

const fxCache: FxRateCacheRepo = {
  lookup: async () => null,
  upsert: async () => {},
  mostRecentPrior: async () => null,
};

describe("FX provider selection", () => {
  test("defaults to cache-only — the API can never make a live FX call", () => {
    const mod = createBudgetingModule({ fxCache });
    expect(mod.fxProvider).toBeInstanceOf(CacheOnlyFxProvider);
  });

  test("live fetching is explicit opt-in, for the worker", () => {
    const mod = createBudgetingModule({ fxCache, liveFx: true });
    expect(mod.fxProvider).toBeInstanceOf(FrankfurterFxProvider);
  });

  test("liveFx: false is cache-only", () => {
    const mod = createBudgetingModule({ fxCache, liveFx: false });
    expect(mod.fxProvider).toBeInstanceOf(CacheOnlyFxProvider);
  });
});
