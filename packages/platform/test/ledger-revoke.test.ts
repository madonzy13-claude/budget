import { test, expect, beforeAll } from "bun:test";
import { sql } from "drizzle-orm";
import { startTestcontainer } from "@budget/db/test/testcontainer";
import { withInfraTx } from "../src/db/tx";

beforeAll(async () => {
  await startTestcontainer();
}, 120_000);

// PC-28: pg_catalog reads do not require a tenant or user GUC; use withInfraTx instead of
// raw migratorPool().connect(). The testcontainer helper is the only raw-client call site
// in tests/ — whitelisted by Plan 00's --exclude-dir=test grep gate.
test("app_role has no UPDATE on expense_ledger", async () => {
  const r = await withInfraTx(async (tx) => {
    const rows = await tx.execute(
      sql`SELECT has_table_privilege('app_role', 'budgeting.expense_ledger', 'UPDATE') AS up`,
    );
    return (rows.rows[0] as { up: boolean }).up;
  });
  expect(r.isOk()).toBe(true);
  if (r.isOk()) expect(r.value).toBe(false);
});
test("app_role has no DELETE on expense_ledger", async () => {
  const r = await withInfraTx(async (tx) => {
    const rows = await tx.execute(
      sql`SELECT has_table_privilege('app_role', 'budgeting.expense_ledger', 'DELETE') AS d`,
    );
    return (rows.rows[0] as { d: boolean }).d;
  });
  expect(r.isOk()).toBe(true);
  if (r.isOk()) expect(r.value).toBe(false);
});
test("app_role has INSERT on expense_ledger", async () => {
  const r = await withInfraTx(async (tx) => {
    const rows = await tx.execute(
      sql`SELECT has_table_privilege('app_role', 'budgeting.expense_ledger', 'INSERT') AS i`,
    );
    return (rows.rows[0] as { i: boolean }).i;
  });
  expect(r.isOk()).toBe(true);
  if (r.isOk()) expect(r.value).toBe(true);
});
