/**
 * multi-currency-0104-limits.test.ts — review WR-09. Before Phase 14 a limit
 * row's currency was write-only metadata (the old route fell back to "USD",
 * unarchive to "EUR"); its amounts were in the budget currency whatever the
 * column said. Reads now convert FROM that column, so 0104 relabels any such
 * row to its category's currency — the budget's at migration time — before a
 * currency change can exist to make a mismatch legitimate.
 *
 * Runs 0104's own statement as postgres on a seeded mismatched row, inside a
 * transaction that is rolled back.
 */
import { describe, test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Pool } from "pg";

const MIGRATOR = process.env.DATABASE_URL_MIGRATOR?.replace("@db:", "@localhost:");
const SQL = readFileSync(join(import.meta.dir, "../../../../drizzle/0104_multi_currency.sql"), "utf8");
const statement = SQL.split("--> statement-breakpoint").find((s) =>
  /UPDATE budgeting\.category_limits/.test(s),
);

describe.skipIf(!MIGRATOR)("Migration 0104 relabels legacy limit currencies", () => {
  test("0104 carries the relabel, inside the lifted-RLS window", () => {
    expect(statement).toBeDefined();
    const at = SQL.indexOf("UPDATE budgeting.category_limits");
    expect(SQL.indexOf("ALTER TABLE budgeting.category_limits NO FORCE ROW LEVEL SECURITY")).toBeLessThan(at);
    expect(SQL.indexOf("ALTER TABLE budgeting.category_limits FORCE ROW LEVEL SECURITY")).toBeGreaterThan(at);
  });

  test("a limit labelled USD in a PLN category becomes PLN, amounts untouched", async () => {
    const su = new Pool({
      connectionString: MIGRATOR!.replace(/\/\/[^:]+:[^@]+@/, `//postgres:${process.env.POSTGRES_PASSWORD}@`),
    });
    const c = await su.connect().catch(() => null);
    if (!c) return void (await su.end()); // a testcontainer whose superuser this cannot reach
    const [t, u, cat] = [crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID()];
    try {
      await c.query("BEGIN");
      await c.query(
        `INSERT INTO identity.users (id, email, name, email_verified, created_at, updated_at)
         VALUES ($1, $2, 'L', true, now(), now())`,
        [u, `wr09-${u.slice(0, 8)}@example.com`],
      );
      await c.query(
        `INSERT INTO tenancy.budgets (id, slug, name, kind, default_currency, owner_user_id, member_count, created_at)
         VALUES ($1, $2, 'L', 'PRIVATE', 'PLN', $3, 1, now())`,
        [t, `wr09-${t.slice(0, 8)}`, u],
      );
      await c.query(
        `INSERT INTO budgeting.categories (id, tenant_id, name, currency, created_at, actor_user_id)
         VALUES ($1, $2, 'Food', 'PLN', now(), $3)`,
        [cat, t, u],
      );
      await c.query(
        `INSERT INTO budgeting.category_limits (id, tenant_id, category_id, normal_amount, normal_currency,
           cushion_amount, cushion_currency, effective_from, actor_user_id, created_at)
         VALUES (gen_random_uuid(), $1, $2, 20000, 'USD', 5000, 'EUR', '2026-01-01', $3, now())`,
        [t, cat, u],
      );
      await c.query(statement!);
      const r = await c.query(
        `SELECT normal_amount::text n, normal_currency::text nc, cushion_amount::text ca, cushion_currency::text cc
           FROM budgeting.category_limits WHERE category_id = $1`,
        [cat],
      );
      expect(r.rows[0]).toEqual({ n: "20000", nc: "PLN", ca: "5000", cc: "PLN" });
    } finally {
      await c.query("ROLLBACK");
      c.release();
      await su.end();
    }
  });
});
