/**
 * multi-currency-0104.test.ts — live-catalog gate for migration 0104 (Phase 14).
 *
 * categories.currency and category_reserve_adjustments.currency exist, are
 * NOT NULL, and budgeting.fx_convert is callable by app_role and worker_role.
 *
 * Catalog-only: FORCE RLS hides rows from the migrator, so the backfill guard
 * (no category whose currency differs from its budget) runs as postgres in
 * 14-01 Task 3 and is recorded in its SUMMARY.
 */
import { describe, test, expect, afterAll } from "bun:test";
import { Pool } from "pg";

const RAW = process.env.DATABASE_URL_MIGRATOR ?? process.env.DATABASE_URL_APP;
// The DB-free unit job loads this directory too: skip there, never throw.
const pool = RAW
  ? new Pool({ connectionString: RAW.replace("@db:", "@localhost:") })
  : (undefined as unknown as Pool);

const one = async <T>(q: string, p: unknown[] = []): Promise<T | undefined> =>
  (await pool.query(q, p)).rows[0] as T | undefined;

const FN = "budgeting.fx_convert(bigint,text,text,date)";

afterAll(() => pool?.end());

describe.skipIf(!RAW)("Migration 0104 multi-currency", () => {
  test.each(["categories", "category_reserve_adjustments"])(
    "%s.currency is a NOT NULL char(3)",
    async (table) => {
      const c = await one<{ data_type: string; is_nullable: string; len: number }>(
        `SELECT data_type, is_nullable, character_maximum_length AS len
           FROM information_schema.columns
          WHERE table_schema = 'budgeting' AND table_name = $1
            AND column_name = 'currency'`,
        [table],
      );
      expect(c).toEqual({ data_type: "character", is_nullable: "NO", len: 3 });
    },
  );

  test("no category is left without a currency", async () => {
    const r = await one<{ n: number }>(
      `SELECT count(*)::int AS n FROM budgeting.categories WHERE currency IS NULL`,
    );
    expect(r?.n).toBe(0);
  });

  test("fx_convert exists", async () => {
    const r = await one<{ p: string | null }>(
      `SELECT to_regprocedure($1)::text AS p`,
      [FN],
    );
    // regprocedure prints without the schema when it is on the search_path.
    expect(r?.p).toContain("fx_convert(bigint,text,text,date)");
  });

  test.each(["app_role", "worker_role"])(
    "%s may EXECUTE fx_convert",
    async (role) => {
      const r = await one<{ ok: boolean }>(
        `SELECT has_function_privilege($1, $2, 'EXECUTE') AS ok`,
        [role, FN],
      );
      expect(r?.ok).toBe(true);
    },
  );

  test("FORCE RLS is restored on every table the backfill touched", async () => {
    const r = await pool.query<{ relname: string; f: boolean }>(
      `SELECT relname, relforcerowsecurity AS f FROM pg_class
        WHERE oid IN ('budgeting.categories'::regclass,
                      'budgeting.category_reserve_adjustments'::regclass,
                      'tenancy.budgets'::regclass)`,
    );
    expect(r.rows.every((x) => x.f)).toBe(true);
  });
});
