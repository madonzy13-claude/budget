/**
 * factory.ts — DI factory for the Budgeting bounded context.
 * Wires adapters to ports. Plans 02-04..02-09 extend this incrementally.
 */
import { FrankfurterFxProvider } from "../adapters/fx/frankfurter";
import { DrizzleAccountRepo } from "../adapters/persistence/account-repo";
import { DrizzleCategoryRepo } from "../adapters/persistence/category-repo";
import { DrizzleCategoryLimitRepo } from "../adapters/persistence/category-limit-repo";
import { DrizzleBudgetTemplateRepo } from "../adapters/persistence/budget-template-repo";
import { DrizzleShareOverrideRepo } from "../adapters/persistence/share-override-repo";
import { DrizzleBudgetModeRepo } from "../adapters/persistence/budget-mode-repo";
import { createAccount } from "../application/create-account";
import { archiveAccount } from "../application/archive-account";
import { adjustAccountBalance } from "../application/adjust-account-balance";
import { listAccounts } from "../application/list-accounts";
import { findAccountById } from "../application/find-account-by-id";
import { createCategory } from "../application/create-category";
import { archiveCategory } from "../application/archive-category";
import { setCategoryLimit } from "../application/set-category-limit";
import { getEffectiveLimit } from "../application/get-effective-limit";
import { applyBudgetTemplate } from "../application/apply-budget-template";
import { setShareOverrides } from "../application/set-share-overrides";
import { toggleBudgetMode } from "../application/toggle-budget-mode";
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
  createCategory: ReturnType<typeof createCategory>;
  archiveCategory: ReturnType<typeof archiveCategory>;
  setCategoryLimit: ReturnType<typeof setCategoryLimit>;
  getEffectiveLimit: ReturnType<typeof getEffectiveLimit>;
  applyBudgetTemplate: ReturnType<typeof applyBudgetTemplate>;
  setShareOverrides: ReturnType<typeof setShareOverrides>;
  toggleBudgetMode: ReturnType<typeof toggleBudgetMode>;
}

export function createBudgetingModule(deps: BudgetingDeps): BudgetingModule {
  const repo = new DrizzleAccountRepo();
  const categoryRepo = new DrizzleCategoryRepo();
  const limitRepo = new DrizzleCategoryLimitRepo();
  const templateRepo = new DrizzleBudgetTemplateRepo();
  const shareRepo = new DrizzleShareOverrideRepo();
  const budgetModeRepo = new DrizzleBudgetModeRepo();

  return {
    fxProvider: new FrankfurterFxProvider(deps.fxCache),
    createAccount: createAccount({ repo }),
    archiveAccount: archiveAccount({ repo }),
    adjustAccountBalance: adjustAccountBalance({ repo }),
    listAccounts: listAccounts({ repo }),
    findAccountById: findAccountById({ repo }),
    createCategory: createCategory({ repo: categoryRepo }),
    archiveCategory: archiveCategory({ repo: categoryRepo }),
    setCategoryLimit: setCategoryLimit({ limitRepo }),
    getEffectiveLimit: getEffectiveLimit({ limitRepo }),
    applyBudgetTemplate: applyBudgetTemplate({ templateRepo }),
    setShareOverrides: setShareOverrides({ shareRepo }),
    toggleBudgetMode: toggleBudgetMode({ budgetModeRepo }),
  };
}
