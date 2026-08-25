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
// app_role DOES hold DELETE, deliberately, since migration 0033: category
// archive purges unconfirmed drafts and DELETE /categories/:id hard-deletes by
// category, both as app_role, and both failed with 42501 without it. GDPR
// erasure needs it too. So append-only is enforced by the UPDATE revoke above,
// not by withholding DELETE, and deletion is fenced by RLS
// (expense_ledger_tenant_isolation, FOR ALL) instead.
//
// This test asserted the pre-0033 rule and had been red ever since. It is
// rewritten rather than deleted: a grant that widens silently is worth a gate,
// so the DELETE is pinned as INTENDED and the column-level UPDATE exception
// from 0019 is pinned with it.
test("app_role's ledger writes stay append-only: DELETE granted (0033), UPDATE only on dismissed_at (0019)", async () => {
  const r = await withInfraTx(async (tx) => {
    const rows = await tx.execute(
      sql`SELECT has_table_privilege('app_role', 'budgeting.expense_ledger', 'DELETE') AS d,
                 has_column_privilege('app_role', 'budgeting.expense_ledger', 'dismissed_at', 'UPDATE') AS dismiss_upd,
                 has_column_privilege('app_role', 'budgeting.expense_ledger', 'tenant_id', 'UPDATE') AS tenant_upd,
                 has_column_privilege('app_role', 'budgeting.expense_ledger', 'created_at', 'UPDATE') AS created_upd`,
    );
    return rows.rows[0] as {
      d: boolean;
      dismiss_upd: boolean;
      tenant_upd: boolean;
      created_upd: boolean;
    };
  });
  expect(r.isOk()).toBe(true);
  if (r.isOk()) {
    expect(r.value.d).toBe(true);
    expect(r.value.dismiss_upd).toBe(true);
    // What append-only actually protects here. PATCH /transactions edits amount,
    // currency, category and date through a column-level grant, so those are NOT
    // the invariant; identity and provenance are. post-migration.sql says it
    // outright: "preserves append-only for id/tenant_id/budget_id/created_at".
    // A row cannot be moved to another tenant or have its history rewritten.
    expect(r.value.tenant_upd).toBe(false);
    expect(r.value.created_upd).toBe(false);
  }
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
