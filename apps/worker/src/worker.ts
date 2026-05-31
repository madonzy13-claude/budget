import { getBoss, stopBoss, workerPool, withInfraTx } from "@budget/platform";
import { sql } from "drizzle-orm";
import { handleOutboxTick } from "./handlers/outbox-dispatch";
import { registerFxDailyFetch } from "./handlers/fx-daily-fetch";
import { registerIdempotencyCleanup } from "./handlers/idempotency-cleanup";
import { registerRecurringEngine } from "./handlers/recurring-engine";
import { registerBudgetingReconciliation } from "./handlers/budgeting-reconciliation";
import type { BudgetingReconciliationSweepDeps } from "./handlers/budgeting-reconciliation";
import { createBudgetingModule } from "@budget/budgeting/src/contracts/factory";
import { DrizzleFxRateCacheRepo } from "@budget/budgeting/src/adapters/persistence/fx-rate-cache-repo";
import { createTaskRepo } from "@budget/budgeting/src/adapters/persistence/task-repo";
import { createReserveBalanceRepo } from "@budget/budgeting/src/adapters/persistence/reserve-balance-repo";
import { DrizzleReservesSummaryRepo } from "@budget/budgeting/src/adapters/persistence/reserves-summary-repo";
import { DrizzleCategoriesRepo } from "@budget/budgeting/src/adapters/persistence/categories-repo";

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
  const { fxProvider } = createBudgetingModule({ fxCache });
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
  const categoriesRepo = new DrizzleCategoriesRepo();
  const reserveBalanceRepo = createReserveBalanceRepo();
  const reservesSummaryRepo = new DrizzleReservesSummaryRepo();
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
    reserveTopup: {
      taskRepo,
      categoriesRepo,
      reserveBalanceRepo,
      reservesSummaryRepo,
      budgetCurrencyOf,
      isReservesEnabled,
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

  console.log(
    "[worker] booted; outbox-dispatch polling=5s schedule=*/1m; fx-daily-fetch schedule=0 17 * * * Europe/Berlin; recurring-engine schedule=0 6 * * * UTC; budgeting-reconciliation schedule=0 * * * * UTC",
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
