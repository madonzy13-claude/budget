import { getBoss, stopBoss } from "@budget/platform";
import { handleOutboxTick } from "./handlers/outbox-dispatch";

async function main() {
  const boss = await getBoss();
  await boss.createQueue("outbox-dispatch");
  await boss.work(
    "outbox-dispatch",
    { pollingIntervalSeconds: 5, batchSize: 1 },
    async () => {
      await handleOutboxTick();
    },
  );
  await boss.schedule("outbox-dispatch", "*/1 * * * *");
  console.log("[worker] booted; outbox-dispatch polling=5s schedule=*/1m");
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
