/**
 * ledger-immutability.test.ts — asserts that UPDATE and DELETE on expense_ledger
 * are rejected at the SQL/GRANT layer for app_role and worker_role.
 *
 * T-13 pattern: raw pg.Client ONLY (no withTenantTx / writeAudit / writeOutbox).
 * This tests the GRANT layer, not the RLS layer.
 */
import { describe, test, expect, afterAll } from "bun:test";
import { Client } from "pg";

// Normalise @db: → @localhost: for host-side test runner (Task 5 pattern)
if (process.env.DATABASE_URL_APP) {
  process.env.DATABASE_URL_APP = process.env.DATABASE_URL_APP.replace("@db:", "@localhost:");
}
if (process.env.DATABASE_URL_WORKER) {
  process.env.DATABASE_URL_WORKER = process.env.DATABASE_URL_WORKER.replace("@db:", "@localhost:");
}

const APP_URL = process.env.DATABASE_URL_APP;
const WORKER_URL = process.env.DATABASE_URL_WORKER;

if (!APP_URL) throw new Error("DATABASE_URL_APP required");
if (!WORKER_URL) throw new Error("DATABASE_URL_WORKER required");

// Fake UUID that won't match any real row — tests permission denial, not data absence
const PHANTOM_ID = "00000000-0000-0000-0000-000000000000";

describe("Ledger immutability (T-2-06-01)", () => {
  test("app_role cannot UPDATE non-editable columns on expense_ledger", async () => {
    // app_role has column-level UPDATE for editable fields (note, amount, etc. per 02-01).
    // But immutable columns (id, tenant_id, created_at, budget_id) must still be blocked.
    const c = new Client({ connectionString: APP_URL });
    await c.connect();
    try {
      await expect(
        c.query(
          `UPDATE budgeting.expense_ledger SET tenant_id = '${PHANTOM_ID}' WHERE id = '${PHANTOM_ID}'`,
        ),
      ).rejects.toThrow(/permission denied/i);
    } finally {
      await c.end();
    }
  });

  test("app_role cannot DELETE from expense_ledger", async () => {
    const c = new Client({ connectionString: APP_URL });
    await c.connect();
    try {
      await expect(
        c.query(
          `DELETE FROM budgeting.expense_ledger WHERE id = '${PHANTOM_ID}'`,
        ),
      ).rejects.toThrow(/permission denied/i);
    } finally {
      await c.end();
    }
  });

  test("worker_role cannot UPDATE expense_ledger", async () => {
    const c = new Client({ connectionString: WORKER_URL });
    await c.connect();
    try {
      await expect(
        c.query(
          `UPDATE budgeting.expense_ledger SET note = 'hacked' WHERE id = '${PHANTOM_ID}'`,
        ),
      ).rejects.toThrow(/permission denied/i);
    } finally {
      await c.end();
    }
  });

  test("worker_role cannot DELETE from expense_ledger", async () => {
    const c = new Client({ connectionString: WORKER_URL });
    await c.connect();
    try {
      await expect(
        c.query(
          `DELETE FROM budgeting.expense_ledger WHERE id = '${PHANTOM_ID}'`,
        ),
      ).rejects.toThrow(/permission denied/i);
    } finally {
      await c.end();
    }
  });
});
