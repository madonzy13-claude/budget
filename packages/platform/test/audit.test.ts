import { test, expect, beforeAll } from "bun:test";
import { sql } from "drizzle-orm";
import { startTestcontainer } from "@budget/db/test/testcontainer";
import { withTenantTx } from "../src/db/tx";
import { writeAudit } from "../src/audit/writer";
import { TenantId, UserId } from "@budget/shared-kernel";

beforeAll(async () => {
  await startTestcontainer();
}, 120_000);

const T1 = TenantId("00000000-0000-0000-0000-000000000010");
const T2 = TenantId("00000000-0000-0000-0000-000000000011");
const U1 = UserId("00000000-0000-0000-0000-000000000020");

test("writeAudit inserts row visible same tenant", async () => {
  const w = await withTenantTx(T1, U1, async (tx) => {
    await writeAudit(tx, {
      tenantId: T1,
      entityType: "workspace",
      entityId: "w1",
      action: "create",
      actorUserId: U1,
      before: null,
      after: { name: "Test" },
    });
    const r = await tx.execute(
      sql`SELECT count(*)::int AS c FROM shared_kernel.audit_history WHERE entity_id = 'w1'`,
    );
    return (r.rows[0] as { c: number }).c;
  });
  expect(w.isOk()).toBe(true);
  if (w.isOk()) expect(w.value).toBeGreaterThanOrEqual(1);
});

test("audit row in T1 invisible from T2 (RLS)", async () => {
  const w = await withTenantTx(T2, U1, async (tx) => {
    const r = await tx.execute(
      sql`SELECT count(*)::int AS c FROM shared_kernel.audit_history WHERE entity_id = 'w1'`,
    );
    return (r.rows[0] as { c: number }).c;
  });
  expect(w.isOk()).toBe(true);
  if (w.isOk()) expect(w.value).toBe(0);
});
