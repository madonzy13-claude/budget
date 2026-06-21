import { getBoss, stopBoss, workerPool, withInfraTx } from "@budget/platform";
import { sql } from "drizzle-orm";
import { handleOutboxTick } from "./handlers/outbox-dispatch";
import { registerFxDailyFetch } from "./handlers/fx-daily-fetch";
import { registerIdempotencyCleanup } from "./handlers/idempotency-cleanup";
import { registerRecurringEngine } from "./handlers/recurring-engine";
import { registerBudgetingReconciliation } from "./handlers/budgeting-reconciliation";
import type { BudgetingReconciliationSweepDeps } from "./handlers/budgeting-reconciliation";
import { registerPushNotificationHandler } from "./handlers/push-notification-handler";
import {
  getSubscriptionsForBudget,
  deleteSubscription,
} from "@budget/platform";
import { createBudgetingModule } from "@budget/budgeting/src/contracts/factory";
import { DrizzleFxRateCacheRepo } from "@budget/budgeting/src/adapters/persistence/fx-rate-cache-repo";
import { createTaskRepo } from "@budget/budgeting/src/adapters/persistence/task-repo";
import { CompositePriceProvider } from "@budget/investments/src/adapters/price/composite-price-provider";
import { TwelveDataPriceProvider } from "@budget/investments/src/adapters/price/twelve-data";
import { CoinGeckoPriceProvider } from "@budget/investments/src/adapters/price/coingecko";
import { FinnhubPriceProvider } from "@budget/investments/src/adapters/price/finnhub";
import { MetalsDevPriceProvider } from "@budget/investments/src/adapters/price/metals-dev";
import type { InstrumentUpsert } from "@budget/investments/src/ports/instrument-repo";
import { registerInstrumentPriceHourly } from "./handlers/instrument-price-hourly";
import {
  registerInstrumentsDailySeed,
  type InstrumentsDailySeedDeps,
} from "./handlers/instruments-daily-seed";
import { registerInvestmentSnapshotDaily } from "./handlers/investment-snapshot-daily";

/**
 * Phase 9: the authoritative supported-instrument universe (search hits the local
 * budgeting.instruments table — D-04). The daily seed upserts this set and delists
 * anything removed from it. Grow this catalog (or swap fetchUniverse for a live
 * provider-API feed) without touching the job mechanics.
 */
const DEFAULT_INVESTMENT_UNIVERSE: InstrumentUpsert[] = [
  {
    symbol: "AAPL",
    displayName: "Apple Inc.",
    provider: "finnhub",
    assetClass: "equities",
    quoteCurrency: "USD",
  },
  {
    symbol: "MSFT",
    displayName: "Microsoft Corp.",
    provider: "finnhub",
    assetClass: "equities",
    quoteCurrency: "USD",
  },
  {
    symbol: "GOOGL",
    displayName: "Alphabet Inc.",
    provider: "finnhub",
    assetClass: "equities",
    quoteCurrency: "USD",
  },
  {
    symbol: "AMZN",
    displayName: "Amazon.com Inc.",
    provider: "finnhub",
    assetClass: "equities",
    quoteCurrency: "USD",
  },
  {
    symbol: "NVDA",
    displayName: "NVIDIA Corp.",
    provider: "finnhub",
    assetClass: "equities",
    quoteCurrency: "USD",
  },
  {
    symbol: "TSLA",
    displayName: "Tesla Inc.",
    provider: "finnhub",
    assetClass: "equities",
    quoteCurrency: "USD",
  },
  {
    symbol: "VOO",
    displayName: "Vanguard S&P 500 ETF",
    provider: "finnhub",
    assetClass: "etf",
    quoteCurrency: "USD",
  },
  {
    symbol: "VWCE",
    displayName: "Vanguard FTSE All-World ETF",
    provider: "twelve_data",
    assetClass: "etf",
    quoteCurrency: "EUR",
  },
  {
    // CoinGecko ids are slugs ("bitcoin"), but users search by ticker ("BTC").
    // The local trigram search matches display_name, so carry the ticker there.
    symbol: "bitcoin",
    displayName: "Bitcoin (BTC)",
    provider: "coingecko",
    assetClass: "crypto",
    quoteCurrency: "USD",
  },
  {
    symbol: "ethereum",
    displayName: "Ethereum (ETH)",
    provider: "coingecko",
    assetClass: "crypto",
    quoteCurrency: "USD",
  },
  {
    symbol: "solana",
    displayName: "Solana (SOL)",
    provider: "coingecko",
    assetClass: "crypto",
    quoteCurrency: "USD",
  },
  {
    // Metals priced via Twelve Data FX pairs (XAU/USD, XAG/USD) instead of
    // metals.dev — its free tier (100 req/mo) is too tight. TD's free tier
    // (800/day) absorbs hourly metals trivially, so drop the daily-only cadence.
    symbol: "XAU/USD",
    displayName: "Gold (troy ounce)",
    provider: "twelve_data",
    assetClass: "commodity",
    quoteCurrency: "USD",
  },
  {
    symbol: "XAG/USD",
    displayName: "Silver (troy ounce)",
    provider: "twelve_data",
    assetClass: "commodity",
    quoteCurrency: "USD",
  },
];

async function main() {
  const boss = await getBoss();

  // Outbox dispatcher
  await boss.createQueue("outbox-dispatch");
  await boss.work(
    "outbox-dispatch",
    { pollingIntervalSeconds: 5, batchSize: 1 },
    async () => {
      await handleOutboxTick();
    },
  );
  await boss.schedule("outbox-dispatch", "*/1 * * * *");

  // FX daily fetcher — 17:00 Europe/Berlin (after Frankfurter publishes ~16:00 CET)
  const fxCache = new DrizzleFxRateCacheRepo(workerPool());
  const { fxProvider, reservePositions } = createBudgetingModule({ fxCache });
  await boss.createQueue("fx-daily-fetch");
  await boss.schedule("fx-daily-fetch", "0 17 * * *", null, {
    tz: "Europe/Berlin",
  });
  registerFxDailyFetch(
    boss as unknown as Parameters<typeof registerFxDailyFetch>[0],
    fxProvider,
  );

  // Idempotency-key cleanup — hourly, deletes expired rows via worker_role + cleanup pgPolicy
  await boss.createQueue("idempotency-cleanup");
  await boss.schedule("idempotency-cleanup", "0 * * * *"); // hourly
  registerIdempotencyCleanup(
    boss as unknown as Parameters<typeof registerIdempotencyCleanup>[0],
  );

  // Recurring engine — daily 06:00 UTC, scans active rules and generates PENDING drafts (Plan 02-08)
  // T-02-WORKER-FX: pass FxProvider so cross-currency rules use real FX rates with bounds check.
  await boss.createQueue("recurring-engine");
  await boss.schedule("recurring-engine", "0 6 * * *"); // UTC, 5-placeholder format (Pitfall 9)
  registerRecurringEngine(
    boss as unknown as Parameters<typeof registerRecurringEngine>[0],
    fxProvider,
  );

  // Budgeting reconciliation — hourly drift check on spending_by_category_month (Plan 02-09)
  // Phase 7 (D-PH7-04 / D-PH7-19): also runs the RESERVE_TOPUP + CUSHION
  // sweep per tenant to catch inline-emit misses (FX drift, manual edits,
  // unhooked mutation paths) within ≤60 minutes.
  const taskRepo = createTaskRepo();
  const budgetCurrencyOf = async (tenantId: string): Promise<string> => {
    const r = await withInfraTx(async (tx) => {
      const dz = tx as {
        execute: (
          q: unknown,
        ) => Promise<{ rows: Array<{ default_currency: string }> }>;
      };
      const rs = await dz.execute(
        sql`SELECT default_currency FROM tenancy.budgets WHERE id = ${tenantId}::uuid LIMIT 1`,
      );
      return rs.rows[0]?.default_currency ?? "EUR";
    });
    return r.isOk() ? r.value : "EUR";
  };
  const isReservesEnabled = async (tenantId: string): Promise<boolean> => {
    const r = await withInfraTx(async (tx) => {
      const dz = tx as {
        execute: (
          q: unknown,
        ) => Promise<{ rows: Array<{ reserves_enabled: boolean }> }>;
      };
      const rs = await dz.execute(
        sql`SELECT reserves_enabled FROM tenancy.budgets WHERE id = ${tenantId}::uuid LIMIT 1`,
      );
      return rs.rows[0]?.reserves_enabled ?? true;
    });
    return r.isOk() ? r.value : true;
  };
  const reconciliationSweepDeps: BudgetingReconciliationSweepDeps = {
    // 05-13: the RESERVE_TOPUP recompute reads surplus straight off the replay
    // orchestrator (reservePositions). It no longer needs categoriesRepo /
    // reserveBalanceRepo / reservesSummaryRepo (the old VIEW + greedy share).
    reserveTopup: {
      taskRepo,
      budgetCurrencyOf,
      isReservesEnabled,
      reservePositions,
    },
    cushion: {
      taskRepo,
      fxProvider,
    },
  };
  await boss.createQueue("budgeting-reconciliation");
  await boss.schedule("budgeting-reconciliation", "0 * * * *"); // UTC hourly, 5-placeholder format
  registerBudgetingReconciliation(
    boss as unknown as Parameters<typeof registerBudgetingReconciliation>[0],
    reconciliationSweepDeps,
  );

  // ── Phase 9: Investments jobs (reference-data scope, no per-tenant iteration) ──
  const priceProvider = new CompositePriceProvider({
    // *_API_KEYS (CSV) enable round-robin failover across multiple free-tier keys
    // when one hits its rate limit; *_API_KEY is the single-key fallback.
    twelve_data: new TwelveDataPriceProvider(
      process.env.TWELVE_DATA_API_KEYS ?? process.env.TWELVE_DATA_API_KEY ?? "",
    ),
    finnhub: new FinnhubPriceProvider(
      process.env.FINNHUB_API_KEYS ?? process.env.FINNHUB_API_KEY ?? "",
    ),
    coingecko: new CoinGeckoPriceProvider(
      process.env.COINGECKO_API_KEYS ?? process.env.COINGECKO_API_KEY ?? "",
    ),
    metals_dev: new MetalsDevPriceProvider(
      process.env.METALS_DEV_API_KEY ?? "",
    ),
  });

  // Held-only price refresh (INV-13). Excludes custom holdings + daily metals.
  // Cadence is env-configurable (PRICE_SCAN_CRON, default every 3h UTC) so the
  // distinct-instrument fan-out stays within the free-tier credit budgets:
  // fewer scans/day ⇒ more distinct instruments fit under the daily cap.
  const PRICE_SCAN_CRON = process.env.PRICE_SCAN_CRON ?? "0 */3 * * *";
  await boss.createQueue("instrument-price-hourly");
  await boss.schedule("instrument-price-hourly", PRICE_SCAN_CRON);
  registerInstrumentPriceHourly(
    boss as unknown as Parameters<typeof registerInstrumentPriceHourly>[0],
    priceProvider,
  );

  // Daily instruments seed + delisting detection (D-09/D-10). 18:00 Europe/Berlin.
  const seedDeps: InstrumentsDailySeedDeps = {
    fetchUniverse: async () => DEFAULT_INVESTMENT_UNIVERSE,
    taskRepo,
  };
  await boss.createQueue("instruments-daily-seed");
  await boss.schedule("instruments-daily-seed", "0 18 * * *", null, {
    tz: "Europe/Berlin",
  });
  registerInstrumentsDailySeed(
    boss as unknown as Parameters<typeof registerInstrumentsDailySeed>[0],
    seedDeps,
  );

  // Daily price + FX snapshot (INV-15). 17:30 Europe/Berlin — after fx-daily-fetch (17:00).
  await boss.createQueue("investment-snapshot-daily");
  await boss.schedule("investment-snapshot-daily", "30 17 * * *", null, {
    tz: "Europe/Berlin",
  });
  registerInvestmentSnapshotDaily(
    boss as unknown as Parameters<typeof registerInvestmentSnapshotDaily>[0],
    fxProvider,
  );

  // Push notifications — eventBus subscriber on task.created (no boss queue).
  registerPushNotificationHandler({
    pushRepo: { getSubscriptionsForBudget, deleteSubscription },
  });

  console.log(
    `[worker] booted; outbox-dispatch polling=5s schedule=*/1m; fx-daily-fetch schedule=0 17 * * * Europe/Berlin; recurring-engine schedule=0 6 * * * UTC; budgeting-reconciliation schedule=0 * * * * UTC; instrument-price-scan schedule=${PRICE_SCAN_CRON} UTC; instruments-daily-seed schedule=0 18 * * * Europe/Berlin; investment-snapshot-daily schedule=30 17 * * * Europe/Berlin`,
  );

  process.on("SIGTERM", async () => {
    console.log("[worker] SIGTERM, stopping...");
    await stopBoss();
    process.exit(0);
  });
  process.on("SIGINT", async () => {
    console.log("[worker] SIGINT, stopping...");
    await stopBoss();
    process.exit(0);
  });
}

main().catch((e) => {
  console.error("[worker] failed", e);
  process.exit(1);
});
