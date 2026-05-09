/**
 * factory.ts — DI factory for the Budgeting bounded context.
 * Wires adapters to ports. Plans 02-04..02-09 extend this incrementally.
 */
import { FrankfurterFxProvider } from "../adapters/fx/frankfurter";
import { DrizzleAccountRepo } from "../adapters/persistence/account-repo";
import { createAccount } from "../application/create-account";
import { archiveAccount } from "../application/archive-account";
import { adjustAccountBalance } from "../application/adjust-account-balance";
import { listAccounts } from "../application/list-accounts";
import { findAccountById } from "../application/find-account-by-id";
import type { FxRateCacheRepo } from "../ports/fx-rate-cache-repo";

export interface BudgetingDeps {
  fxCache: FxRateCacheRepo;
}

export interface BudgetingModule {
  fxProvider: FrankfurterFxProvider;
  createAccount: ReturnType<typeof createAccount>;
  archiveAccount: ReturnType<typeof archiveAccount>;
  adjustAccountBalance: ReturnType<typeof adjustAccountBalance>;
  listAccounts: ReturnType<typeof listAccounts>;
  findAccountById: ReturnType<typeof findAccountById>;
}

export function createBudgetingModule(deps: BudgetingDeps): BudgetingModule {
  const repo = new DrizzleAccountRepo();

  return {
    fxProvider: new FrankfurterFxProvider(deps.fxCache),
    createAccount: createAccount({ repo }),
    archiveAccount: archiveAccount({ repo }),
    adjustAccountBalance: adjustAccountBalance({ repo }),
    listAccounts: listAccounts({ repo }),
    findAccountById: findAccountById({ repo }),
  };
}
