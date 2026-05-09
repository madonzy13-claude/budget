/* DI factory; populated incrementally by plans 02-04..02-09 (per analog packages/tenancy/src/contracts/factory.ts) */
import { FrankfurterFxProvider } from "../adapters/fx/frankfurter";
import type { FxRateCacheRepo } from "../ports/fx-rate-cache-repo";

export interface BudgetingDeps {
  fxCache: FxRateCacheRepo;
}

export interface BudgetingModule {
  fxProvider: FrankfurterFxProvider;
}

export function createBudgetingModule(deps: BudgetingDeps): BudgetingModule {
  return { fxProvider: new FrankfurterFxProvider(deps.fxCache) };
}
