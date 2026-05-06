import { test, expect, beforeAll } from "bun:test";
import { sql } from "drizzle-orm";
import { startTestcontainer } from "@budget/db/test/testcontainer";
import {
  withTenantTx,
  withTenantTxRead,
  withInfraTx,
  TenantContextError,
} from "../src/db/tx";
import { TenantId, UserId } from "@budget/shared-kernel";

beforeAll(async () => {
  await startTestcontainer();
});

test("withTenantTxRead empty array → TenantContextError", async () => {
  const r = await withTenantTxRead(
    [],
    UserId("00000000-0000-0000-0000-000000000099"),
    async () => 1,
  );
  expect(r.isErr()).toBe(true);
  if (r.isErr()) expect(r.error).toBeInstanceOf(TenantContextError);
});

test("withTenantTx sets BOTH app.tenant_ids AND app.current_user_id GUCs inside tx", async () => {
  const tid = TenantId("00000000-0000-0000-0000-000000000001");
  const uid = UserId("00000000-0000-0000-0000-000000000099");
  const r = await withTenantTx(tid, uid, async (tx) => {
    const rows = await tx.execute(
      sql`SELECT current_setting('app.tenant_ids', true) AS t, current_setting('app.current_user_id', true) AS u`,
    );
    return rows.rows[0] as { t: string; u: string };
  });
  expect(r.isOk()).toBe(true);
  if (r.isOk()) {
    expect(r.value.t).toContain("00000000-0000-0000-0000-000000000001");
    expect(r.value.u).toBe("00000000-0000-0000-0000-000000000099");
  }
});

test("withTenantTx commits on success", async () => {
  const tid = TenantId("00000000-0000-0000-0000-000000000002");
  const uid = UserId("00000000-0000-0000-0000-000000000099");
  const r = await withTenantTx(tid, uid, async () => 42);
  expect(r.isOk()).toBe(true);
  if (r.isOk()) expect(r.value).toBe(42);
});

test("withTenantTx wraps thrown errors as Result.err", async () => {
  const tid = TenantId("00000000-0000-0000-0000-000000000003");
  const uid = UserId("00000000-0000-0000-0000-000000000099");
  const r = await withTenantTx(tid, uid, async () => {
    throw new Error("boom");
  });
  expect(r.isErr()).toBe(true);
});

test("withInfraTx opens raw tx WITHOUT GUCs (PC-04)", async () => {
  const r = await withInfraTx(async (tx) => {
    const rows = await tx.execute(
      sql`SELECT current_setting('app.tenant_ids', true) AS t, current_setting('app.current_user_id', true) AS u`,
    );
    return rows.rows[0] as { t: string | null; u: string | null };
  });
  expect(r.isOk()).toBe(true);
  if (r.isOk()) {
    // Neither GUC was set
    expect(r.value.t === null || r.value.t === "").toBe(true);
    expect(r.value.u === null || r.value.u === "").toBe(true);
  }
});
