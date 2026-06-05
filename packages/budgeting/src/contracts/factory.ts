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
import { withInfraTx, withTenantTx } from "@budget/platform";
import { TenantId, UserId } from "@budget/shared-kernel";
import { recomputeReserveTopupTask } from "../application/recompute-reserve-topup-task";
import type { TenantTx } from "../ports/task-repo";
import { sql } from "drizzle-orm";
import type { FxRateCacheRepo } from "../ports/fx-rate-cache-repo";
import { DrizzleCategoryReserveAdjustmentsRepo } from "../adapters/persistence/category-reserve-adjustments-repo";
import { DrizzleReservesSummaryRepo } from "../adapters/persistence/reserves-summary-repo";
import { DrizzleCategoriesRepo } from "../adapters/persistence/categories-repo";
import { updateWallet } from "../application/update-wallet";
import { reorderWallets } from "../application/reorder-wallets";
import { adjustCategoryReserve } from "../application/adjust-category-reserve";
import { toggleCategoryReserveExcluded } from "../application/toggle-category-reserve-excluded";
import { getReservesSummary } from "../application/get-reserves-summary";
import { getReservePositions } from "../application/get-reserve-positions";
import { createReserveEventLoaderRepo } from "../adapters/persistence/reserve-event-loader-repo";

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
  // Plan 05-03: reserves + wallet mutation use cases
  updateWallet: ReturnType<typeof updateWallet>;
  // UAT-PH5-T3-1x: persist intra-section drag reorder
  reorderWallets: ReturnType<typeof reorderWallets>;
  adjustCategoryReserve: ReturnType<typeof adjustCategoryReserve>;
  toggleCategoryReserveExcluded: ReturnType<
    typeof toggleCategoryReserveExcluded
  >;
  getReservesSummary: ReturnType<typeof getReservesSummary>;
  reservePositions: ReturnType<typeof getReservePositions>;
  /** A2-fallback recompute of the RESERVE_TOPUP task in its own tx. Called by
   *  transaction routes after a create/edit/confirm/delete so the task shortfall
   *  tracks the reserve pool (transactions change usage → expected reserve). */
  recomputeReserveTopup: (input: {
    tenantId: string;
    budgetId: string;
    actorUserId: string;
  }) => Promise<void>;
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

  // Replay orchestrator (05-12): loads the ordered reserve events for the budget
  // and folds them through reserve-engine. Shared by the reserves tab display and
  // (05-13) the RESERVE_TOPUP reconciliation so both read ONE engine-derived
  // reserve per category. The event-loader (05-11) owns spend/limit/cushion/
  // adjustment/flag/wallet reads + RLS — the old VIEW-derived deps are gone.
  const reserveEventLoader = createReserveEventLoaderRepo({
    transactionRepo,
    categoryLimitRepo: limitRepo,
    reservesSummaryRepo,
  });
  const reservePositions = getReservePositions({
    eventLoader: reserveEventLoader,
  });

  return {
    fxProvider,
    // Phase 7 follow-up: transactions change reserve usage (cumulative
    // overspend draw), so the RESERVE_TOPUP shortfall must be recomputed after
    // every transaction mutation — otherwise the task message goes stale until
    // the hourly sweep. Own-tx A2 fallback (same pattern as adjustCategoryReserve).
    recomputeReserveTopup: async (input) => {
      const isEnabled = await isReservesEnabled(input.tenantId);
      // Skip the tx entirely when reserves are off and no task could exist.
      await withTenantTx(
        TenantId(input.tenantId),
        UserId(input.actorUserId),
        async (tx) => {
          await recomputeReserveTopupTask(
            tx as unknown as TenantTx,
            { tenantId: input.tenantId, budgetId: input.budgetId },
            {
              taskRepo: createTaskRepo(),
              budgetCurrencyOf: getWorkspaceDefaultCurrency,
              isReservesEnabled: async () => isEnabled,
              reservePositions,
            },
          );
        },
      );
    },
    // Wallet methods (Plan 01-03 route rename)
    // Phase 7 (D-PH7-19): inject taskRepo + fxProvider so a new CUSHION
    // wallet auto-emits/resolves CUSHION_BELOW_TARGET.
    createWallet: createWallet({
      repo,
      taskRepo: createTaskRepo(),
      fxProvider,
    }),
    // 05-13: archiving a RESERVE wallet drops userDefined (Σ RESERVE balances)
    // → surplus moves → recompute RESERVE_TOPUP off the orchestrator. No more
    // category actual recalc.
    // Phase 7 (D-PH7-19): inject fxProvider so archiving a CUSHION wallet
    // auto-emits/resolves CUSHION_BELOW_TARGET.
    archiveWallet: archiveWallet({
      repo,
      taskRepo: createTaskRepo(),
      reservePositions,
      budgetCurrencyOf: getWorkspaceDefaultCurrency,
      isReservesEnabled,
      fxProvider,
    }),
    // 05-13 (decision C): a RESERVE wallet balance change sets userDefined only
    // (Σ RESERVE balances) → surplus moves → recompute RESERVE_TOPUP off the
    // orchestrator. No category allocation.
    // Phase 7 (D-PH7-19): fxProvider for the CUSHION recompute branch.
    setWalletBalance: setWalletBalance({
      repo,
      categoriesRepo,
      budgetCurrencyOf: getWorkspaceDefaultCurrency,
      taskRepo: createTaskRepo(),
      isReservesEnabled,
      fxProvider,
      reservePositions,
    }),
    listWallets: listWallets({ repo }),
    findWalletById: findWalletById({ repo }),
    // Backward-compat account aliases
    createAccount: createAccount({ repo }),
    archiveAccount: archiveAccount({ repo }),
    listAccounts: listAccounts({ repo }),
    findAccountById: findAccountById({ repo }),
    createCategory: createCategory({ repo: categoryRepo }),
    // 05-13 (decision J): archiving drops the category's reserve from internal
    // going forward (orchestrator excludes archived) → recompute RESERVE_TOPUP.
    // No sibling release.
    archiveCategory: archiveCategory({
      repo: categoryRepo,
      taskRepo: createTaskRepo(),
      reservePositions,
      budgetCurrencyOf: getWorkspaceDefaultCurrency,
      isReservesEnabled,
    }),
    listCategories: listCategories({ repo: categoryRepo }),
    findCategoryById: findCategoryById({ repo: categoryRepo }),
    renameCategory: renameCategory({ repo: categoryRepo }),
    // Phase 7 (D-PH7-19): inject taskRepo + fxProvider so a category limit
    // change auto-emits/resolves CUSHION_BELOW_TARGET (cushion_amount is on
    // category_limits — every limit change can shift cushion required).
    setCategoryLimit: setCategoryLimit({
      limitRepo,
      taskRepo: createTaskRepo(),
      fxProvider,
    }),
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
    // Phase 7 UAT-9 fix: taskRepo injected so inline catch-up drafts emit
    // CONFIRM_DRAFT immediately (no 18h wait for the 0 6 * * * cron).
    createRecurringRule: createRecurringRule({
      ruleRepo: recurringRuleRepo,
      fxProvider,
      taskRepo: createTaskRepo(),
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
    // Plan 05-03: reserves + wallet mutation use cases.
    // Phase 7 (D-PH7-04, Pitfall 1): taskRepo + isReservesEnabled wired so a
    // SPENDINGS↔RESERVE type flip (or amount/currency change on a RESERVE
    // wallet) auto-emits/resolves RESERVE_TOPUP.
    // Phase 7 (D-PH7-19, Pitfall 1): fxProvider wired so a SPENDINGS↔CUSHION
    // type flip or balance/currency change on a CUSHION wallet auto-emits/
    // resolves CUSHION_BELOW_TARGET.
    updateWallet: updateWallet({
      repo,
      budgetCurrencyOf: getWorkspaceDefaultCurrency,
      categoriesRepo,
      taskRepo: createTaskRepo(),
      isReservesEnabled,
      fxProvider,
      reservePositions,
    }),
    // UAT-PH5-T3-1x: intra-section reorder
    reorderWallets: reorderWallets({ repo }),
    // Phase 7 (D-PH7-04): taskRepo wired so any reserve adjustment
    // auto-emits/resolves RESERVE_TOPUP. Reserve adjustments always touch
    // the reserve side of the equation (no wallet-type gate needed).
    adjustCategoryReserve: adjustCategoryReserve({
      adjustmentsRepo,
      categoriesRepo,
      reservePositions,
      isReservesEnabled,
      budgetCurrencyOf: getWorkspaceDefaultCurrency,
      taskRepo: createTaskRepo(),
    }),
    // 05-13: excluding/including a category shifts internal (ΣR) → recompute
    // RESERVE_TOPUP. Categories are independent — no sibling refill.
    toggleCategoryReserveExcluded: toggleCategoryReserveExcluded({
      repo: categoriesRepo,
      taskRepo: createTaskRepo(),
      reservePositions,
      budgetCurrencyOf: getWorkspaceDefaultCurrency,
      isReservesEnabled,
    }),
    getReservesSummary: getReservesSummary({
      categoriesRepo,
      budgetCurrencyOf: getWorkspaceDefaultCurrency,
      isReservesEnabled,
      reservePositions,
    }),
    reservePositions,
  };
}
