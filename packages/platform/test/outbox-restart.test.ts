import { test, expect, beforeAll } from "bun:test";
import { sql } from "drizzle-orm";
import { startTestcontainer } from "@budget/db/test/testcontainer";
import { withTenantTx, withInfraTx } from "../src/db/tx";
import { writeOutbox } from "../src/outbox/writer";
import { dispatchOutboxBatch } from "../src/outbox/dispatcher";
import { eventBus } from "../src/events/bus";
import { TenantId, UserId } from "@budget/shared-kernel";

beforeAll(async () => {
  await startTestcontainer();
});

const T = TenantId("00000000-0000-0000-0000-0000000000b0");
const U = UserId("00000000-0000-0000-0000-0000000000b1");

test("outbox events delivered exactly once across simulated restart", async () => {
  await withTenantTx(T, U, async (tx) => {
    for (let i = 0; i < 5; i++) {
      await writeOutbox(tx, {
        tenantId: T,
        aggregateType: "restart",
        aggregateId: String(i),
        eventType: "restart.evt",
        payload: { i },
      });
    }
  });
  const seen = new Set<number>();
  eventBus.subscribe("restart.evt", async (e) => {
    seen.add((e.payload as { i: number }).i);
  });

  await dispatchOutboxBatch();
  const second = await dispatchOutboxBatch();
  expect(second).toBe(0);

  const r = await withInfraTx(async (tx) =>
    tx.execute(
      sql`SELECT count(*)::int AS c FROM shared_kernel.outbox WHERE aggregate_type = 'restart' AND dispatched_at IS NULL`,
    ),
  );
  expect(r.isOk()).toBe(true);
  if (r.isOk()) expect((r.value.rows[0] as { c: number }).c).toBe(0);
  expect(seen.size).toBe(5);
});
