import { getBoss, stopBoss, workerPool } from "@budget/platform";
import { handleOutboxTick } from "./handlers/outbox-dispatch";
import { registerFxDailyFetch } from "./handlers/fx-daily-fetch";
import { registerIdempotencyCleanup } from "./handlers/idempotency-cleanup";
import { registerRecurringEngine } from "./handlers/recurring-engine";
import { createBudgetingModule } from "@budget/budgeting/src/contracts/factory";
import { DrizzleFxRateCacheRepo } from "@budget/budgeting/src/adapters/persistence/fx-rate-cache-repo";

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
  registerFxDailyFetch(boss, fxProvider);

  // Idempotency-key cleanup — hourly, deletes expired rows via worker_role + cleanup pgPolicy
  await boss.createQueue("idempotency-cleanup");
  await boss.schedule("idempotency-cleanup", "0 * * * *"); // hourly
  registerIdempotencyCleanup(boss);

  // Recurring engine — daily 06:00 UTC, scans active rules and generates PENDING drafts (Plan 02-08)
  await boss.createQueue("recurring-engine");
  await boss.schedule("recurring-engine", "0 6 * * *"); // UTC, 5-placeholder format (Pitfall 9)
  registerRecurringEngine(boss);

  console.log(
    "[worker] booted; outbox-dispatch polling=5s schedule=*/1m; fx-daily-fetch schedule=0 17 * * * Europe/Berlin; recurring-engine schedule=0 6 * * * UTC",
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
