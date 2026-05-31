/**
 * boot.ts — pre-flight initialization for apps/api.
 *
 * PC-02 + PC-15: imports ONLY from package ROOTS — never /dist/ or src/adapters/.
 * Sequence: loadEnv() → libsodiumReady() → logger → tenancy module → identity module → budgeting module.
 */
import {
  loadEnv,
  StdoutEmailSender,
  type EmailSender,
} from "@budget/shared-kernel";
import {
  libsodiumReady,
  LibsodiumKeyStore,
  SmtpEmailSender,
  workerPool,
} from "@budget/platform";
import { createIdentityModule } from "@budget/identity"; // PC-02, PC-15
import { createTenancyModule } from "@budget/tenancy"; // PC-02, PC-15
import { createBudgetingModule } from "@budget/budgeting/src/contracts/factory";
import { DrizzleFxRateCacheRepo } from "@budget/budgeting/src/adapters/persistence/fx-rate-cache-repo";
import { createBudgetHomeSummaryRepo } from "@budget/budgeting/src/adapters/persistence/budget-home-summary-repo";
import { getBudgetHomeSummary } from "@budget/budgeting/src/application/get-budget-home-summary";
import { createTaskRepo } from "@budget/budgeting/src/adapters/persistence/task-repo";
import { listPendingTasks } from "@budget/budgeting/src/application/list-pending-tasks";
import { DrizzleCategoryRepo } from "@budget/budgeting/src/adapters/persistence/category-repo";
import { DrizzleCategoryLimitRepo } from "@budget/budgeting/src/adapters/persistence/category-limit-repo";
import { DrizzleTransactionRepo } from "@budget/budgeting/src/adapters/persistence/transaction-repo";
import { createReserveBalanceRepo } from "@budget/budgeting/src/adapters/persistence/reserve-balance-repo";
import { createSpendingsSummaryRepo } from "@budget/budgeting/src/adapters/persistence/spendings-summary-repo";
import { DrizzleExpenseLedgerDraftPortRepo } from "@budget/budgeting/src/adapters/persistence/expense-ledger-draft-port-repo";
import { reorderCategories } from "@budget/budgeting/src/application/reorder-categories";
import { dismissDraft } from "@budget/budgeting/src/application/dismiss-draft";
import { confirmDraft } from "@budget/budgeting/src/application/confirm-draft";
import { getSpendingsSummary } from "@budget/budgeting/src/application/get-spendings-summary";
import { UserId } from "@budget/shared-kernel";
import pino, { type BaseLogger } from "pino";

export interface BootedDeps {
  env: ReturnType<typeof loadEnv>;
  logger: BaseLogger;
  keyStore: LibsodiumKeyStore;
  emailSender: EmailSender;
  identity: ReturnType<typeof createIdentityModule>;
  tenancy: ReturnType<typeof createTenancyModule>;
  /**
   * Budgeting module plus the HOME-02 plan extension
   * (`getBudgetHomeSummary`). The base module from `createBudgetingModule`
   * is wide-typed; we intersect to surface the new method on the deps shape
   * without touching the factory.
   */
  budgeting: ReturnType<typeof createBudgetingModule> & {
    getBudgetHomeSummary: ReturnType<typeof getBudgetHomeSummary>;
    /** BDP-03: list PENDING tasks for the banner read path. */
    listPendingTasks: ReturnType<typeof listPendingTasks>;
    /** GRID-09: PUT sort-order drag-reorder persistence */
    reorderCategories: ReturnType<typeof reorderCategories>;
    /** RECR-06: per-occurrence dismiss */
    dismissDraft: ReturnType<typeof dismissDraft>;
    /** RECR-03/04: per-occurrence confirm (CASE B) */
    confirmDraft: ReturnType<typeof confirmDraft>;
    /** GRID-02/15, RSCM-03/04: 5-row spendings header read */
    getSpendingsSummary: ReturnType<typeof getSpendingsSummary>;
  };
}

/**
 * bootstrapSupportedCurrencies — one-shot best-effort on API boot.
 * Fetches Frankfurter /v2/currencies and UPSERTs into budgeting.supported_currencies.
 * Migration already seeded 8 fiat + 6 crypto stubs; this enriches with the full list.
 */
export async function bootstrapSupportedCurrencies(
  fetchFn: typeof fetch = fetch,
): Promise<void> {
  try {
    const r = await fetchFn("https://api.frankfurter.dev/v2/currencies");
    if (!r.ok) return; // best-effort; stub data already seeded by migration
    const j = (await r.json()) as Record<string, string>;
    const entries = Object.entries(j);
    if (entries.length === 0) return;
    const pool = workerPool(); // worker_role has INSERT on supported_currencies
    const values = entries
      .map(
        ([iso, name]) =>
          `('${iso.replace(/'/g, "''")}', NULL, '${name.replace(/'/g, "''")}', NULL, 'FIAT', 'frankfurter')`,
      )
      .join(",");
    await pool.query(
      `INSERT INTO budgeting.supported_currencies (iso_code, iso_numeric, name, symbol, kind, provider)
       VALUES ${values}
       ON CONFLICT (iso_code) DO NOTHING`,
    );
  } catch {
    // swallow — bootstrap is best-effort; stub data already seeded
  }
}

function buildEmailSender(
  env: ReturnType<typeof loadEnv>,
  logger: BaseLogger,
): EmailSender {
  if (env.SMTP_HOST && env.SMTP_PORT && env.SMTP_FROM) {
    logger.info(
      { host: env.SMTP_HOST, port: env.SMTP_PORT, from: env.SMTP_FROM },
      "email transport: SMTP",
    );
    return new SmtpEmailSender({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      from: env.SMTP_FROM,
      ...(env.SMTP_USER !== undefined ? { user: env.SMTP_USER } : {}),
      ...(env.SMTP_PASS !== undefined ? { pass: env.SMTP_PASS } : {}),
    });
  }
  logger.warn(
    "email transport: stdout (SMTP_HOST/SMTP_PORT/SMTP_FROM not set) — emails will not be delivered",
  );
  return new StdoutEmailSender();
}

export async function boot(): Promise<BootedDeps> {
  const env = loadEnv();

  // Pitfall 9: await libsodiumReady before any crypto call or HTTP listener
  await libsodiumReady();

  const logger = pino({ level: env.LOG_LEVEL });
  const keyStore = new LibsodiumKeyStore();
  const emailSender = buildEmailSender(env, logger);

  // Build tenancy first — its organizationPlugin is injected into identity
  const tenancy = createTenancyModule({ emailSender, appUrl: env.APP_URL });

  const identity = createIdentityModule({
    emailSender,
    keyStore,
    additionalPlugins: [tenancy.organizationPlugin],
    additionalSchema: tenancy.betterAuthSchema,
  });

  // Budgeting module: FX adapter wired to real cache repo (worker_role pool)
  const fxCache = new DrizzleFxRateCacheRepo(workerPool());
  const baseBudgeting = createBudgetingModule({ fxCache });

  // HOME-02: wire the budget-home-summary service. The UserDisplayCurrencyReader
  // port is adapted from deps.identity.userRepo here — keeping the cross-context
  // boundary at the apps/api composition layer (budgeting does NOT depend on
  // @budget/identity).
  const summaryRepo = createBudgetHomeSummaryRepo();
  const displayCurrencyReader = {
    getDisplayCurrency: async (userId: string) => {
      const user = await identity.userRepo.findById(UserId(userId));
      return user?.display_currency ?? null;
    },
  };
  const homeSummaryService = getBudgetHomeSummary({
    summaryRepo,
    fxProvider: baseBudgeting.fxProvider,
    displayCurrencyReader,
  });
  // BDP-03: wire the list-pending-tasks read service. Port-based composition
  // mirrors HOME-02 (createBudgetHomeSummaryRepo + getBudgetHomeSummary).
  const taskRepo = createTaskRepo();
  const listPendingTasksService = listPendingTasks({ taskRepo });

  // Phase 4 repos + services
  const categoryRepo = new DrizzleCategoryRepo();
  const categoryLimitRepo = new DrizzleCategoryLimitRepo();
  const transactionRepo = new DrizzleTransactionRepo();
  const reserveBalanceRepo = createReserveBalanceRepo();
  const spendingsSummaryRepo = createSpendingsSummaryRepo();
  const expenseLedgerDraftPortRepo = new DrizzleExpenseLedgerDraftPortRepo();

  const reorderCategoriesService = reorderCategories({ repo: categoryRepo });
  // Phase 7 (D-PH7-10): inject taskRepo so dismiss auto-resolves the
  // matching PENDING CONFIRM_DRAFT task (separate withTenantTx — A2 fallback,
  // see dismiss-draft.ts comment for trade-off).
  const dismissDraftService = dismissDraft({
    repo: expenseLedgerDraftPortRepo,
    taskRepo,
  });
  const confirmDraftService = confirmDraft({
    repo: expenseLedgerDraftPortRepo,
  });
  const getSpendingsSummaryService = getSpendingsSummary({
    categoryRepo,
    categoryLimitRepo,
    transactionRepo,
    reserveBalanceRepo,
    summaryRepo: spendingsSummaryRepo,
  });

  const budgeting = Object.assign(baseBudgeting, {
    getBudgetHomeSummary: homeSummaryService,
    listPendingTasks: listPendingTasksService,
    reorderCategories: reorderCategoriesService,
    dismissDraft: dismissDraftService,
    confirmDraft: confirmDraftService,
    getSpendingsSummary: getSpendingsSummaryService,
  });

  logger.info({ region: env.REGION }, "apps/api booted");

  return { env, logger, keyStore, emailSender, identity, tenancy, budgeting };
}
