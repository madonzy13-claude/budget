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
import { DrizzleTransactionRepo } from "../adapters/persistence/transaction-repo";
import { DrizzleSpendingProjectionRepo } from "../adapters/persistence/spending-projection-repo";
import { DrizzleRecurringRuleRepo } from "../adapters/persistence/recurring-rule-repo";
import { DrizzleRecurringDraftRepo } from "../adapters/persistence/recurring-draft-repo";
import { createWallet } from "../application/create-wallet";
import { archiveWallet } from "../application/archive-wallet";
import { adjustWalletBalance } from "../application/adjust-wallet-balance";
import { listWallets } from "../application/list-wallets";
import { findWalletById } from "../application/find-wallet-by-id";
// Backward-compat aliases (routes migrated in Plan 01-03)
import { createAccount } from "../application/create-account";
import { archiveAccount } from "../application/archive-account";
import { adjustAccountBalance } from "../application/adjust-account-balance";
import { listAccounts } from "../application/list-accounts";
import { findAccountById } from "../application/find-account-by-id";
import { createCategory } from "../application/create-category";
import { archiveCategory } from "../application/archive-category";
import { listCategories } from "../application/list-categories";
import { findCategoryById } from "../application/find-category-by-id";
import { renameCategory } from "../application/rename-category";
import { setCategoryLimit } from "../application/set-category-limit";
import { getEffectiveLimit } from "../application/get-effective-limit";
import { applyBudgetTemplate } from "../application/apply-budget-template";
import { setShareOverrides } from "../application/set-share-overrides";
import { listShareOverrides } from "../application/list-share-overrides";
import { toggleBudgetMode } from "../application/toggle-budget-mode";
import { createTransaction } from "../application/create-transaction";
import { getLatestTransactions } from "../application/get-latest-transactions";
import { listSupportedCurrencies } from "../application/list-supported-currencies";
import { editTransaction } from "../application/edit-transaction";
import { getTransactionHistory } from "../application/get-transaction-history";
import { createRecurringRule } from "../application/create-recurring-rule";
import { updateRecurringRule } from "../application/update-recurring-rule";
import { deleteRecurringRule } from "../application/delete-recurring-rule";
import { confirmRecurringDraft } from "../application/confirm-recurring-draft";
import { editAndConfirmRecurringDraft } from "../application/edit-and-confirm-recurring-draft";
import { skipRecurringDraft } from "../application/skip-recurring-draft";
import { listPendingDrafts } from "../application/list-pending-drafts";
import { searchTransactions } from "../application/search-transactions";
import { bulkRecategorize } from "../application/bulk-recategorize";
import { reconcileProjections } from "../application/reconcile-projections";
import { replayProjections } from "../application/replay-projections";
import { withInfraTx } from "@budget/platform";
import { sql } from "drizzle-orm";
import type { FxRateCacheRepo } from "../ports/fx-rate-cache-repo";

export interface BudgetingDeps {
  fxCache: FxRateCacheRepo;
}

export interface BudgetingModule {
  fxProvider: FrankfurterFxProvider;
  // Wallet methods (renamed from account in Plan 01-02/01-03)
  createWallet: ReturnType<typeof createWallet>;
  archiveWallet: ReturnType<typeof archiveWallet>;
  adjustWalletBalance: ReturnType<typeof adjustWalletBalance>;
  listWallets: ReturnType<typeof listWallets>;
  findWalletById: ReturnType<typeof findWalletById>;
  // Backward-compat account aliases (deprecated, use wallet methods above)
  createAccount: ReturnType<typeof createAccount>;
  archiveAccount: ReturnType<typeof archiveAccount>;
  adjustAccountBalance: ReturnType<typeof adjustAccountBalance>;
  listAccounts: ReturnType<typeof listAccounts>;
  findAccountById: ReturnType<typeof findAccountById>;
  createCategory: ReturnType<typeof createCategory>;
  archiveCategory: ReturnType<typeof archiveCategory>;
  listCategories: ReturnType<typeof listCategories>;
  findCategoryById: ReturnType<typeof findCategoryById>;
  renameCategory: ReturnType<typeof renameCategory>;
  setCategoryLimit: ReturnType<typeof setCategoryLimit>;
  getEffectiveLimit: ReturnType<typeof getEffectiveLimit>;
  applyBudgetTemplate: ReturnType<typeof applyBudgetTemplate>;
  setShareOverrides: ReturnType<typeof setShareOverrides>;
  listShareOverrides: ReturnType<typeof listShareOverrides>;
  toggleBudgetMode: ReturnType<typeof toggleBudgetMode>;
  createTransaction: ReturnType<typeof createTransaction>;
  getLatestTransactions: ReturnType<typeof getLatestTransactions>;
  editTransaction: ReturnType<typeof editTransaction>;
  getTransactionHistory: ReturnType<typeof getTransactionHistory>;
  listSupportedCurrencies: typeof listSupportedCurrencies;
  /** Exposed for plan 02-08 createInTx cross-plan contract */
  transactionRepo: DrizzleTransactionRepo;
  // Plan 02-08: recurring rules + drafts
  createRecurringRule: ReturnType<typeof createRecurringRule>;
  updateRecurringRule: ReturnType<typeof updateRecurringRule>;
  deleteRecurringRule: ReturnType<typeof deleteRecurringRule>;
  confirmRecurringDraft: ReturnType<typeof confirmRecurringDraft>;
  editAndConfirmRecurringDraft: ReturnType<typeof editAndConfirmRecurringDraft>;
  skipRecurringDraft: ReturnType<typeof skipRecurringDraft>;
  listPendingDrafts: ReturnType<typeof listPendingDrafts>;
  recurringRuleRepo: DrizzleRecurringRuleRepo;
  recurringDraftRepo: DrizzleRecurringDraftRepo;
  // Plan 02-09: search + bulk re-categorize + projection durability
  searchTransactions: ReturnType<typeof searchTransactions>;
  bulkRecategorize: ReturnType<typeof bulkRecategorize>;
  reconcileProjections: ReturnType<typeof reconcileProjections>;
  replayProjections: ReturnType<typeof replayProjections>;
}

/** Resolves budget default_currency from tenancy.budgets (renamed from workspaces in v1.1). */
async function getWorkspaceDefaultCurrency(tenantId: string): Promise<string> {
  const r = await withInfraTx(async (tx) => {
    const drizzleTx = tx as {
      execute: (
        q: unknown,
      ) => Promise<{ rows: Array<{ default_currency: string }> }>;
    };
    const rs = await drizzleTx.execute(
      sql`SELECT default_currency FROM tenancy.budgets WHERE id = ${tenantId}::uuid LIMIT 1`,
    );
    return rs.rows[0]?.default_currency ?? "EUR";
  });
  return r.isOk() ? r.value : "EUR";
}

export function createBudgetingModule(deps: BudgetingDeps): BudgetingModule {
  const repo = new DrizzleAccountRepo();
  const categoryRepo = new DrizzleCategoryRepo();
  const limitRepo = new DrizzleCategoryLimitRepo();
  const templateRepo = new DrizzleBudgetTemplateRepo();
  const shareRepo = new DrizzleShareOverrideRepo();
  const budgetModeRepo = new DrizzleBudgetModeRepo();
  const projectionRepo = new DrizzleSpendingProjectionRepo();
  const transactionRepo = new DrizzleTransactionRepo(repo, projectionRepo);
  const recurringRuleRepo = new DrizzleRecurringRuleRepo();
  const recurringDraftRepo = new DrizzleRecurringDraftRepo();
  const fxProvider = new FrankfurterFxProvider(deps.fxCache);

  return {
    fxProvider,
    // Wallet methods (Plan 01-03 route rename)
    createWallet: createWallet({ repo }),
    archiveWallet: archiveWallet({ repo }),
    adjustWalletBalance: adjustWalletBalance({ repo }),
    listWallets: listWallets({ repo }),
    findWalletById: findWalletById({ repo }),
    // Backward-compat account aliases
    createAccount: createAccount({ repo }),
    archiveAccount: archiveAccount({ repo }),
    adjustAccountBalance: adjustAccountBalance({ repo }),
    listAccounts: listAccounts({ repo }),
    findAccountById: findAccountById({ repo }),
    createCategory: createCategory({ repo: categoryRepo }),
    archiveCategory: archiveCategory({ repo: categoryRepo }),
    listCategories: listCategories({ repo: categoryRepo }),
    findCategoryById: findCategoryById({ repo: categoryRepo }),
    renameCategory: renameCategory({ repo: categoryRepo }),
    setCategoryLimit: setCategoryLimit({ limitRepo }),
    getEffectiveLimit: getEffectiveLimit({ limitRepo }),
    applyBudgetTemplate: applyBudgetTemplate({ templateRepo }),
    setShareOverrides: setShareOverrides({ shareRepo }),
    listShareOverrides: listShareOverrides({ shareRepo }),
    toggleBudgetMode: toggleBudgetMode({ budgetModeRepo }),
    createTransaction: createTransaction({
      transactionRepo,
      accountRepo: repo,
      fxProvider,
      getWorkspaceDefaultCurrency,
    }),
    getLatestTransactions: getLatestTransactions({ transactionRepo }),
    editTransaction: editTransaction({
      transactionRepo,
      fxProvider,
      getWorkspaceDefaultCurrency,
    }),
    getTransactionHistory: getTransactionHistory({ transactionRepo }),
    listSupportedCurrencies,
    transactionRepo,
    // Plan 02-08
    createRecurringRule: createRecurringRule({ ruleRepo: recurringRuleRepo }),
    updateRecurringRule: updateRecurringRule({
      ruleRepo: recurringRuleRepo,
      draftRepo: recurringDraftRepo,
    }),
    deleteRecurringRule: deleteRecurringRule({ ruleRepo: recurringRuleRepo }),
    confirmRecurringDraft: confirmRecurringDraft({
      draftRepo: recurringDraftRepo,
      transactionRepo,
    }),
    editAndConfirmRecurringDraft: editAndConfirmRecurringDraft({
      draftRepo: recurringDraftRepo,
      transactionRepo,
    }),
    skipRecurringDraft: skipRecurringDraft({ draftRepo: recurringDraftRepo }),
    listPendingDrafts: listPendingDrafts({ draftRepo: recurringDraftRepo }),
    recurringRuleRepo,
    recurringDraftRepo,
    // Plan 02-09
    searchTransactions: searchTransactions(),
    bulkRecategorize: bulkRecategorize({ transactionRepo }),
    reconcileProjections: reconcileProjections(),
    replayProjections: replayProjections(),
  };
}
