import { dispatchOutboxBatch } from "@budget/platform";

export async function handleOutboxTick() {
  const n = await dispatchOutboxBatch();
  if (n > 0) console.log(`[worker] dispatched ${n} outbox events`);
}
