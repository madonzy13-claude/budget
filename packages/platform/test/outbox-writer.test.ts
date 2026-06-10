import { test, expect, beforeAll } from "bun:test";
import { startTestcontainer } from "@budget/db/test/testcontainer";
import { withTenantTx } from "../src/db/tx";
import { writeOutbox } from "../src/outbox/writer";
import { dispatchOutboxBatch } from "../src/outbox/dispatcher";
import { eventBus } from "../src/events/bus";
import { TenantId, UserId } from "@budget/shared-kernel";

beforeAll(async () => {
  await startTestcontainer();
}, 120_000);

const T1 = TenantId("00000000-0000-0000-0000-0000000000a0");
const U1 = UserId("00000000-0000-0000-0000-0000000000a1");

test("writeOutbox + dispatch publishes event exactly once", async () => {
  let calls = 0;
  eventBus.subscribe("test.evt", async () => {
    calls++;
  });
  await withTenantTx(T1, U1, async (tx) => {
    await writeOutbox(tx, {
      tenantId: T1,
      aggregateType: "X",
      aggregateId: "a1",
      eventType: "test.evt",
      payload: { v: 1 },
    });
  });
  const n1 = await dispatchOutboxBatch();
  const n2 = await dispatchOutboxBatch();
  expect(n1).toBeGreaterThanOrEqual(1);
  expect(n2).toBe(0);
  expect(calls).toBe(1);
});
