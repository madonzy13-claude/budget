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
import { ExpenseLedgerDraftRepo } from "../adapters/persistence/expense-ledger-draft-repo";
import { createWallet } from "../application/create-wallet";
import { archiveWallet } from "../application/archive-wallet";
import { setWalletBalance } from "../application/set-wallet-balance";
import { listWallets } from "../application/list-wallets";
import { findWalletById } from "../application/find-wallet-by-id";
// Backward-compat aliases (routes migrated in Plan 01-03)
import { createAccount } from "../application/create-account";
import { archiveAccount } from "../application/archive-account";
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
import { createRecurringRule } from "../application/create-recurring-rule";
import { updateRecurringRule } from "../application/update-recurring-rule";
import { deleteRecurringRule } from "../application/delete-recurring-rule";
import { confirmRecurringDraft } from "../application/confirm-recurring-draft";
import { editAndConfirmRecurringDraft } from "../application/edit-and-confirm-recurring-draft";
import { skipRecurringDraft } from "../application/skip-recurring-draft";
import { createTaskRepo } from "../adapters/persistence/task-repo";
import { listPendingDrafts } from "../application/list-pending-drafts";
import { searchTransactions } from "../application/search-transactions";
import { bulkRecategorize } from "../application/bulk-recategorize";
import { reconcileProjections } from "../application/reconcile-projections";
import { replayProjections } from "../application/replay-projections";
import { withInfraTx } from "@budget/platform";
import { sql } from "drizzle-orm";
import type { FxRateCacheRepo } from "../ports/fx-rate-cache-repo";
import { createReserveBalanceRepo } from "../adapters/persistence/reserve-balance-repo";
import type { ReserveBalanceRepo } from "../ports/reserve-balance-repo";
import { DrizzleCategoryReserveAdjustmentsRepo } from "../adapters/persistence/category-reserve-adjustments-repo";
import { DrizzleReservesSummaryRepo } from "../adapters/persistence/reserves-summary-repo";
import { DrizzleCategoriesRepo } from "../adapters/persistence/categories-repo";
import { updateWallet } from "../application/update-wallet";
import { reorderWallets } from "../application/reorder-wallets";
import { adjustCategoryReserve } from "../application/adjust-category-reserve";
import { toggleCategoryReserveExcluded } from "../application/toggle-category-reserve-excluded";
import { getReservesSummary } from "../application/get-reserves-summary";

export interface BudgetingDeps {
  fxCache: FxRateCacheRepo;
}

export interface BudgetingModule {
  fxProvider: FrankfurterFxProvider;
  // Wallet methods (renamed from account in Plan 01-02/01-03)
  createWallet: ReturnType<typeof createWallet>;
  archiveWallet: ReturnType<typeof archiveWallet>;
  /** D-PH2-09 amended: setBalance overwrites current_balance to absolute value (no delta math). */
  setWalletBalance: ReturnType<typeof setWalletBalance>;
  listWallets: ReturnType<typeof listWallets>;
  findWalletById: ReturnType<typeof findWalletById>;
  // Backward-compat account aliases (deprecated, use wallet methods above)
  createAccount: ReturnType<typeof createAccount>;
  archiveAccount: ReturnType<typeof archiveAccount>;
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
  listSupportedCurrencies: typeof listSupportedCurrencies;
  /** Exposed for plan 02-08 createInTx cross-plan contract */
  transactionRepo: DrizzleTransactionRepo;
  // Plan 02-08 / 02-02: recurring rules + drafts (drafts now in expense_ledger)
  createRecurringRule: ReturnType<typeof createRecurringRule>;
  updateRecurringRule: ReturnType<typeof updateRecurringRule>;
  deleteRecurringRule: ReturnType<typeof deleteRecurringRule>;
  confirmRecurringDraft: ReturnType<typeof confirmRecurringDraft>;
  editAndConfirmRecurringDraft: ReturnType<typeof editAndConfirmRecurringDraft>;
  skipRecurringDraft: ReturnType<typeof skipRecurringDraft>;
  listPendingDrafts: ReturnType<typeof listPendingDrafts>;
  recurringRuleRepo: DrizzleRecurringRuleRepo;
  recurringDraftRepo: ExpenseLedgerDraftRepo;
  // Plan 02-09: search + bulk re-categorize + projection durability
  searchTransactions: ReturnType<typeof searchTransactions>;
  bulkRecategorize: ReturnType<typeof bulkRecategorize>;
  reconcileProjections: ReturnType<typeof reconcileProjections>;
  replayProjections: ReturnType<typeof replayProjections>;
  // Plan 02-03: reserve balance read-model
  reserveBalanceRepo: ReserveBalanceRepo;
  // Plan 05-03: reserves + wallet mutation use cases
  updateWallet: ReturnType<typeof updateWallet>;
  // UAT-PH5-T3-1x: persist intra-section drag reorder
  reorderWallets: ReturnType<typeof reorderWallets>;
  adjustCategoryReserve: ReturnType<typeof adjustCategoryReserve>;
  toggleCategoryReserveExcluded: ReturnType<
    typeof toggleCategoryReserveExcluded
  >;
  getReservesSummary: ReturnType<typeof getReservesSummary>;
}

/** Checks budgets.reserves_enabled for the given tenantId. */
async function isReservesEnabled(tenantId: string): Promise<boolean> {
  const r = await withInfraTx(async (tx) => {
    const drizzleTx = tx as {
      execute: (
        q: unknown,
      ) => Promise<{ rows: Array<{ reserves_enabled: boolean }> }>;
    };
    const rs = await drizzleTx.execute(
      sql`SELECT reserves_enabled FROM tenancy.budgets WHERE id = ${tenantId}::uuid LIMIT 1`,
    );
    return rs.rows[0]?.reserves_enabled ?? true;
  });
  return r.isOk() ? r.value : true;
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
  const recurringDraftRepo = new ExpenseLedgerDraftRepo();
  const fxProvider = new FrankfurterFxProvider(deps.fxCache);
  // Plan 05-03: new repos
  const adjustmentsRepo = new DrizzleCategoryReserveAdjustmentsRepo();
  const reservesSummaryRepo = new DrizzleReservesSummaryRepo();
  const categoriesRepo = new DrizzleCategoriesRepo();

  return {
    fxProvider,
    // Wallet methods (Plan 01-03 route rename)
    createWallet: createWallet({ repo }),
    // UAT-PH5-T3-59: archive must recalc reserve actuals when a RESERVE
    // wallet leaves the pool (mirrors setWalletBalance deps).
    archiveWallet: archiveWallet({
      repo,
      categoriesRepo,
      reserveBalanceRepo: createReserveBalanceRepo(),
      reservesSummaryRepo,
    }),
    setWalletBalance: setWalletBalance({
      repo,
      categoriesRepo,
      reserveBalanceRepo: createReserveBalanceRepo(),
      reservesSummaryRepo,
      budgetCurrencyOf: getWorkspaceDefaultCurrency,
    }),
    listWallets: listWallets({ repo }),
    findWalletById: findWalletById({ repo }),
    // Backward-compat account aliases
    createAccount: createAccount({ repo }),
    archiveAccount: archiveAccount({ repo }),
    listAccounts: listAccounts({ repo }),
    findAccountById: findAccountById({ repo }),
    createCategory: createCategory({ repo: categoryRepo }),
    archiveCategory: archiveCategory({
      repo: categoryRepo,
      categoriesRepo,
      reserveBalanceRepo: createReserveBalanceRepo(),
    }),
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
    listSupportedCurrencies,
    transactionRepo,
    // Plan 02-08 / 02-02
    createRecurringRule: createRecurringRule({
      ruleRepo: recurringRuleRepo,
      fxProvider,
    }),
    updateRecurringRule: updateRecurringRule({
      ruleRepo: recurringRuleRepo,
      draftRepo: recurringDraftRepo,
    }),
    deleteRecurringRule: deleteRecurringRule({ ruleRepo: recurringRuleRepo }),
    // Phase 7 (D-PH7-09 / D-PH7-10): taskRepo injected so confirm + skip
    // auto-resolve the matching PENDING CONFIRM_DRAFT task in the same tx.
    confirmRecurringDraft: confirmRecurringDraft({
      taskRepo: createTaskRepo(),
    }),
    editAndConfirmRecurringDraft: editAndConfirmRecurringDraft(),
    skipRecurringDraft: skipRecurringDraft({ taskRepo: createTaskRepo() }),
    listPendingDrafts: listPendingDrafts(),
    recurringRuleRepo,
    recurringDraftRepo,
    // Plan 02-09
    searchTransactions: searchTransactions(),
    bulkRecategorize: bulkRecategorize({ transactionRepo }),
    reconcileProjections: reconcileProjections(),
    replayProjections: replayProjections(),
    // Plan 02-03: reserve balance read-model
    reserveBalanceRepo: createReserveBalanceRepo(),
    // Plan 05-03: reserves + wallet mutation use cases
    updateWallet: updateWallet({
      repo,
      budgetCurrencyOf: getWorkspaceDefaultCurrency,
      categoriesRepo,
      reserveBalanceRepo: createReserveBalanceRepo(),
      reservesSummaryRepo,
    }),
    // UAT-PH5-T3-1x: intra-section reorder
    reorderWallets: reorderWallets({ repo }),
    adjustCategoryReserve: adjustCategoryReserve({
      adjustmentsRepo,
      categoriesRepo,
      reserveBalanceRepo: createReserveBalanceRepo(),
      reservesSummaryRepo,
      isReservesEnabled,
      budgetCurrencyOf: getWorkspaceDefaultCurrency,
    }),
    toggleCategoryReserveExcluded: toggleCategoryReserveExcluded({
      repo: categoriesRepo,
      reserveBalanceRepo: createReserveBalanceRepo(),
    }),
    getReservesSummary: getReservesSummary({
      reserveBalanceRepo: createReserveBalanceRepo(),
      reservesSummaryRepo,
      categoriesRepo,
      budgetCurrencyOf: getWorkspaceDefaultCurrency,
      isReservesEnabled,
    }),
  };
}
