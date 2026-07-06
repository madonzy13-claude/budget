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
  appPool,
} from "@budget/platform";
import { createInvestmentsModule } from "@budget/investments/src/contracts/factory";
import { DrizzleHoldingRepo } from "@budget/investments/src/adapters/persistence/holding-repo";
import { DrizzleInstrumentRepo } from "@budget/investments/src/adapters/persistence/instrument-repo";
import { DrizzlePriceCacheRepo } from "@budget/investments/src/adapters/persistence/price-cache-repo";
import { CompositePriceProvider } from "@budget/investments/src/adapters/price/composite-price-provider";
import { TwelveDataPriceProvider } from "@budget/investments/src/adapters/price/twelve-data";
import { CoinGeckoPriceProvider } from "@budget/investments/src/adapters/price/coingecko";
import { FinnhubPriceProvider } from "@budget/investments/src/adapters/price/finnhub";
import { MetalsDevPriceProvider } from "@budget/investments/src/adapters/price/metals-dev";
import { GoldApiPriceProvider } from "@budget/investments/src/adapters/price/gold-api";
import { resolveApiKey } from "@budget/investments/src/ports/price-provider";
import { createIdentityModule } from "@budget/identity"; // PC-02, PC-15
import { createTenancyModule } from "@budget/tenancy"; // PC-02, PC-15
import { createBudgetingModule } from "@budget/budgeting/src/contracts/factory";
import { DrizzleFxRateCacheRepo } from "@budget/budgeting/src/adapters/persistence/fx-rate-cache-repo";
import { createBudgetHomeSummaryRepo } from "@budget/budgeting/src/adapters/persistence/budget-home-summary-repo";
import { getBudgetHomeSummary } from "@budget/budgeting/src/application/get-budget-home-summary";
import { createTaskRepo } from "@budget/budgeting/src/adapters/persistence/task-repo";
import { listPendingTasks } from "@budget/budgeting/src/application/list-pending-tasks";
import { resolveTask } from "@budget/budgeting/src/application/resolve-task";
import { getCushionSummary } from "@budget/budgeting/src/application/get-cushion-summary";
import { recomputeCushionTask } from "@budget/budgeting/src/application/recompute-cushion-task";
import { makeRecomputeIncomeUnderPlannedTask } from "@budget/budgeting/src/application/recompute-income-under-planned-task";
import { withTenantTx } from "@budget/platform";
import { DrizzleCategoryRepo } from "@budget/budgeting/src/adapters/persistence/category-repo";
import { DrizzleIncomeRepo } from "@budget/budgeting/src/adapters/persistence/income-repo";
import { DrizzleCategoryLimitRepo } from "@budget/budgeting/src/adapters/persistence/category-limit-repo";
import { DrizzleTransactionRepo } from "@budget/budgeting/src/adapters/persistence/transaction-repo";
import { createSpendingsSummaryRepo } from "@budget/budgeting/src/adapters/persistence/spendings-summary-repo";
import { DrizzleExpenseLedgerDraftPortRepo } from "@budget/budgeting/src/adapters/persistence/expense-ledger-draft-port-repo";
import { reorderCategories } from "@budget/budgeting/src/application/reorder-categories";
import { dismissDraft } from "@budget/budgeting/src/application/dismiss-draft";
import { confirmDraft } from "@budget/budgeting/src/application/confirm-draft";
import { getSpendingsSummary } from "@budget/budgeting/src/application/get-spendings-summary";
import { getOverviewCards } from "@budget/budgeting/src/application/get-overview-cards";
import { createOverviewCardsRepo } from "@budget/budgeting/src/adapters/persistence/overview-cards-repo";
import { getOverviewPlanned } from "@budget/budgeting/src/application/get-overview-planned";
import { getOverviewOverspent } from "@budget/budgeting/src/application/get-overview-overspent";
import { getOverviewWealth } from "@budget/budgeting/src/application/get-overview-wealth";
import { computeBudgetWealthNow } from "@budget/budgeting/src/application/compute-budget-wealth-now";
import { createWealthSnapshotRepo } from "@budget/budgeting/src/adapters/persistence/wealth-snapshot-repo";
import { createOverviewRepo } from "@budget/budgeting/src/adapters/persistence/overview-repo";
import { TenantId, UserId } from "@budget/shared-kernel";
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
    /** Plan 07-07 (D-PH7-09): POST /tasks/:taskId/resolve banner action. */
    resolveTask: ReturnType<typeof resolveTask>;
    /** Plan 07-07 (D-PH7-20): GET /budgets/:id/cushion-summary single source of cushion math. */
    getCushionSummary: ReturnType<typeof getCushionSummary>;
    /**
     * Plan 07-07 (D-PH7-19): runner for the cushion task recompute helper.
     * Opens its own withTenantTx (SYSTEM user) and calls recomputeCushionTask.
     * Wired into the PATCH /budgets/:id route on cushion-affecting bodies
     * (cushion_target_months / cushion_enabled).
     */
    /** r33: own-tx runner for the INCOME_UNDER_PLANNED task ("review your
     * spendings"). Wired into income CRUD + set-category-limit. */
    recomputeIncomeUnderPlannedRunner: (input: {
      tenantId: string;
      budgetId: string;
    }) => Promise<void>;
    recomputeCushionTaskRunner: (input: {
      tenantId: string;
      budgetId: string;
    }) => Promise<void>;
    /** GRID-09: PUT sort-order drag-reorder persistence */
    reorderCategories: ReturnType<typeof reorderCategories>;
    /** RECR-06: per-occurrence dismiss */
    dismissDraft: ReturnType<typeof dismissDraft>;
    /** RECR-03/04: per-occurrence confirm (CASE B) */
    confirmDraft: ReturnType<typeof confirmDraft>;
    /** GRID-02/15, RSCM-03/04: 5-row spendings header read */
    getSpendingsSummary: ReturnType<typeof getSpendingsSummary>;
    /** Phase 11 (11-03): 5-card Overview summary (default_currency). */
    getOverviewCards: ReturnType<typeof getOverviewCards>;
    /** Phase 11 (11-04): Planned section (timeline + planned-avg + recurring). */
    getOverviewPlanned: ReturnType<typeof getOverviewPlanned>;
    /** Phase 11 (11-05): Overspent + Reserves section (after-reserves, default_ccy). */
    getOverviewOverspent: ReturnType<typeof getOverviewOverspent>;
    /** Phase 11 (11-06): Financial-Wealth section (snapshot series + live point + pie). */
    getOverviewWealth: ReturnType<typeof getOverviewWealth>;
  };
  /** Phase 9: Investments bounded context (CRUD + search + reorder + on-add fetch). */
  investments: ReturnType<typeof createInvestmentsModule>;
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
  // Plan 07-07 (D-PH7-09): POST /tasks/:taskId/resolve banner action.
  const resolveTaskService = resolveTask({ taskRepo });
  // Plan 07-07 (D-PH7-20): GET /budgets/:id/cushion-summary single source of
  // cushion math. Uses the budgeting module's fxProvider (Frankfurter cache).
  const getCushionSummaryService = getCushionSummary({
    fxProvider: baseBudgeting.fxProvider,
  });
  // Plan 07-07 (D-PH7-19): runner for recomputeCushionTask. Used by PATCH
  // /budgets/:id when cushion_target_months or cushion_enabled changes. A2
  // fallback: separate withTenantTx from the identity update (best-effort —
  // failure does not fail the PATCH; hourly sweep is the backstop).
  const SYSTEM_USER_UUID = "00000000-0000-0000-0000-000000000001";
  const recomputeCushionTaskRunner = async (input: {
    tenantId: string;
    budgetId: string;
  }) => {
    const r = await withTenantTx(
      TenantId(input.tenantId),
      UserId(SYSTEM_USER_UUID),
      async (tx) => {
        await recomputeCushionTask(
          tx as unknown as {
            execute: (q: unknown) => Promise<{
              rows: Record<string, unknown>[];
            }>;
          },
          { tenantId: input.tenantId, budgetId: input.budgetId },
          { taskRepo, fxProvider: baseBudgeting.fxProvider },
        );
      },
    );
    if (r.isErr()) {
      throw r.error;
    }
  };

  // r33: own-tx runner for the INCOME_UNDER_PLANNED task. Wired into the incomes
  // route (income CRUD) + set-category-limit (planned change). Best-effort —
  // failure is logged, never fails the request; the hourly sweep is the backstop.
  const recomputeIncomeUnderPlannedRunner = makeRecomputeIncomeUnderPlannedTask(
    {
      taskRepo,
      fxProvider: baseBudgeting.fxProvider,
    },
  );

  // Phase 4 repos + services
  const categoryRepo = new DrizzleCategoryRepo();
  const categoryLimitRepo = new DrizzleCategoryLimitRepo();
  const transactionRepo = new DrizzleTransactionRepo();
  // 05-14: the OLD VIEW-backed reserveBalanceRepo + greedy reservesSummaryRepo
  // are gone from boot. Reserve numbers now come from the replay orchestrator
  // (baseBudgeting.reservePositions → event-loader → reserve-engine); the
  // event-loader is constructed inside the factory, not here.
  const spendingsSummaryRepo = createSpendingsSummaryRepo();
  const expenseLedgerDraftPortRepo = new DrizzleExpenseLedgerDraftPortRepo();

  const reorderCategoriesService = reorderCategories({ repo: categoryRepo });
  // 260612-kxd T3: dismiss auto-resolves the matching PENDING CONFIRM_DRAFT
  // task INSIDE the adapter's own tx (expense-ledger-draft-port-repo.ts) —
  // no taskRepo dep, no separate withTenantTx (Phase 7 A2 fallback removed).
  const dismissDraftService = dismissDraft({
    repo: expenseLedgerDraftPortRepo,
  });
  // Phase 7 (D-PH7-10) + UAT round 12: confirm also auto-resolves the
  // matching PENDING CONFIRM_DRAFT task (mirrors dismiss above).
  const confirmDraftService = confirmDraft({
    repo: expenseLedgerDraftPortRepo,
    taskRepo,
  });
  const getSpendingsSummaryService = getSpendingsSummary({
    categoryRepo,
    categoryLimitRepo,
    transactionRepo,
    summaryRepo: spendingsSummaryRepo,
    // 05-12: reserveUsed/overspent for the viewed month come straight from the
    // engine cells via the replay orchestrator — the SAME engine-derived reserve
    // per category the reserves tab reads. No reserve_actual fallback.
    reservePositions: baseBudgeting.reservePositions,
    // r33: income + FX drive the smart Investments limit (income − Σ other planned).
    incomeRepo: new DrizzleIncomeRepo(),
    fxProvider: baseBudgeting.fxProvider,
  });

  const budgeting = Object.assign(baseBudgeting, {
    getBudgetHomeSummary: homeSummaryService,
    listPendingTasks: listPendingTasksService,
    resolveTask: resolveTaskService,
    getCushionSummary: getCushionSummaryService,
    recomputeCushionTaskRunner,
    recomputeIncomeUnderPlannedRunner,
    reorderCategories: reorderCategoriesService,
    dismissDraft: dismissDraftService,
    confirmDraft: confirmDraftService,
    getSpendingsSummary: getSpendingsSummaryService,
  });

  // Phase 9: Investments module. HoldingRepo uses withTenantTx internally (no pool);
  // instrument/price-cache repos + the rate-limit counter run on the app_role pool.
  // Reuse baseBudgeting.fxProvider for enrichment (no second FX path — SPEC).
  const investments = createInvestmentsModule({
    pool: appPool(),
    fxProvider: baseBudgeting.fxProvider,
    holdingRepo: new DrizzleHoldingRepo(),
    instrumentRepo: new DrizzleInstrumentRepo(appPool()),
    priceCacheRepo: new DrizzlePriceCacheRepo(appPool()),
    priceProvider: new CompositePriceProvider({
      // *_API_KEYS (CSV) preferred for round-robin failover; *_API_KEY is the
      // single-key fallback. normalizeKeys() inside each adapter splits the CSV.
      // Use `||` (not `??`): an EMPTY-STRING *_API_KEYS placeholder must fall
      // through to the single *_API_KEY, otherwise it shadows it and the adapter
      // gets no key → every price comes back price_unavailable.
      twelve_data: new TwelveDataPriceProvider(
        resolveApiKey(env.TWELVE_DATA_API_KEYS, env.TWELVE_DATA_API_KEY),
      ),
      finnhub: new FinnhubPriceProvider(
        resolveApiKey(env.FINNHUB_API_KEYS, env.FINNHUB_API_KEY),
      ),
      coingecko: new CoinGeckoPriceProvider(
        resolveApiKey(env.COINGECKO_API_KEYS, env.COINGECKO_API_KEY),
      ),
      metals_dev: new MetalsDevPriceProvider(env.METALS_DEV_API_KEY || ""),
      // Metals (XAU/XAG/XPT) — gold-api.com, free + keyless (TD free is gold-only).
      gold_api: new GoldApiPriceProvider(),
    }),
  });

  // Phase 11 (11-03): the 5-card Overview summary. Wired AFTER investments so the
  // holdings-valuation port can reuse investments.listHoldings (already FX→budget
  // currency via valueInBudgetCents). metaReader + cushion + spendings are reused
  // verbatim (no new cushion/overspent math — D-08/D-10).
  const overviewCardsRepo = createOverviewCardsRepo();
  const holdingsValuation = {
    investmentValueCents: async (input: {
      tenantId: string;
      budgetId: string;
      defaultCurrency: string;
    }): Promise<bigint> => {
      const r = await investments.listHoldings({
        tenantId: input.tenantId,
        budgetId: input.budgetId,
        actorUserId: SYSTEM_USER_UUID,
        budgetCurrency: input.defaultCurrency,
      });
      if (r.isErr()) throw r.error;
      return r.value.holdings.reduce(
        (sum, h) => sum + BigInt(h.valueInBudgetCents),
        0n,
      );
    },
  };
  const budgetingFinal = Object.assign(budgeting, {
    getOverviewCards: getOverviewCards({
      metaReader: summaryRepo,
      walletRepo: overviewCardsRepo,
      holdingsValuation,
      fxProvider: baseBudgeting.fxProvider,
      cushionSummary: getCushionSummaryService,
      spendingsSummary: getSpendingsSummaryService,
      reservesSummary: baseBudgeting.getReservesSummary,
    }),
    // Phase 11 (11-04): Planned section. Multi-month aggregation repo + the same
    // meta reader + fxProvider (recurring amounts only).
    getOverviewPlanned: getOverviewPlanned({
      repo: createOverviewRepo(),
      metaReader: summaryRepo,
      fxProvider: baseBudgeting.fxProvider,
    }),
    // Phase 11 (11-05): Overspent + Reserves section. After-reserves overspent
    // reuses the overview-repo monthly aggregation + the reserve engine seam
    // (reservePositions) for reserve_used per month; reserves-by-category reuses
    // get-reserves-summary. All default_ccy — no FX (D-10/D-06).
    getOverviewOverspent: getOverviewOverspent({
      overviewRepo: createOverviewRepo(),
      reservePositions: baseBudgeting.reservePositions,
      reservesSummary: baseBudgeting.getReservesSummary,
      metaReader: summaryRepo,
    }),
    // Phase 11 (11-06): Financial-Wealth section. 3h snapshot series + a live
    // current point from computeBudgetWealthNow (same numbers as the cards/cron);
    // investments-view pie groups investments.listHoldings by holding_type.
    getOverviewWealth: getOverviewWealth({
      snapshotRepo: createWealthSnapshotRepo(),
      computeWealthNow: computeBudgetWealthNow({
        walletRepo: overviewCardsRepo,
        holdingsValuation,
        fxProvider: baseBudgeting.fxProvider,
      }),
      holdingsByType: {
        valueByType: async (input: {
          tenantId: string;
          budgetId: string;
          defaultCurrency: string;
        }) => {
          const r = await investments.listHoldings({
            tenantId: input.tenantId,
            budgetId: input.budgetId,
            actorUserId: SYSTEM_USER_UUID,
            budgetCurrency: input.defaultCurrency,
          });
          if (r.isErr()) throw r.error;
          const byType = new Map<string, bigint>();
          for (const h of r.value.holdings) {
            byType.set(
              h.holdingType,
              (byType.get(h.holdingType) ?? 0n) + BigInt(h.valueInBudgetCents),
            );
          }
          return Array.from(byType.entries()).map(
            ([holding_type, value_cents]) => ({ holding_type, value_cents }),
          );
        },
      },
      metaReader: summaryRepo,
    }),
  });

  logger.info({ region: env.REGION }, "apps/api booted");

  return {
    env,
    logger,
    keyStore,
    emailSender,
    identity,
    tenancy,
    budgeting: budgetingFinal,
    investments,
  };
}
