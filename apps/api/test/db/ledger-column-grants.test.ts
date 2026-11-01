/**
 * ledger-column-grants.test.ts — the ledger's column UPDATE grants survive a
 * migrate. post-migration.sql runs after EVERY migrate and REVOKEs table-wide
 * UPDATE (which drops column grants too), so a grant living only in a
 * numbered migration silently vanished on the next migrate (R6: deferring an
 * unconfirmed payment, re-converting it on its date).
 */
import { describe, it, expect } from "bun:test";
import { Pool } from "pg";

const url = (process.env.DATABASE_URL_APP ?? "").replace("@db:", "@localhost:");

describe("expense_ledger column grants", () => {
  it("app sets deferred_at; the worker clears it and re-converts", async () => {
    const pool = new Pool({ connectionString: url });
    try {
      const can = async (role: string, col: string) =>
        (
          await pool.query(
            `SELECT has_column_privilege($1, 'budgeting.expense_ledger', $2, 'UPDATE') AS ok`,
            [role, col],
          )
        ).rows[0].ok as boolean;
      expect(await can("app_role", "deferred_at")).toBe(true);
      for (const col of [
        "deferred_at",
        "updated_at",
        "amount_converted_cents",
        "fx_rate",
        "fx_as_of",
      ])
        expect([col, await can("worker_role", col)]).toEqual([col, true]);
    } finally {
      await pool.end();
    }
  });
});
