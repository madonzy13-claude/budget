/**
 * investment-history-0087.test.ts — live-catalog gate for migration 0087 (Phase 13).
 *
 * Asserts the shape the later plans rely on: the investment_history ledger with
 * ENABLE+FORCE RLS and its tenant policy, the kind CHECK, the stocks ui_type
 * merge (D-10/D-11) and tenancy.budgets.investment_type_order (D-12).
 *
 * Catalog-only on purpose: FORCE RLS hides every row from the migrator role, so
 * the data checks (Start backfill count, no legacy ui_type rows) run as postgres
 * in 13-03 Task 3 and are recorded in its SUMMARY.
 */
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { Pool } from "pg";

const RAW = process.env.DATABASE_URL_MIGRATOR ?? process.env.DATABASE_URL_APP;
// The DB-free unit job loads this directory too: skip there, never throw.
const pool = RAW
  ? new Pool({ connectionString: RAW.replace("@db:", "@localhost:") })
  : (undefined as unknown as Pool);

const one = async <T>(q: string, p: unknown[] = []): Promise<T | undefined> =>
  (await pool.query(q, p)).rows[0] as T | undefined;

afterAll(() => pool?.end());

describe.skipIf(!RAW)("Migration 0087 investment history", () => {
  let cols: Record<
    string,
    { data_type: string; is_nullable: string; column_default: string | null }
  >;

  beforeAll(async () => {
    const r = await pool.query(
      `SELECT column_name, data_type, is_nullable, column_default
         FROM information_schema.columns
        WHERE table_schema = 'budgeting' AND table_name = 'investment_history'`,
    );
    cols = Object.fromEntries(r.rows.map((c) => [c.column_name, c]));
  });

  test("ledger table exists with ENABLE + FORCE RLS", async () => {
    const r = await one<{ rls: boolean; force: boolean }>(
      `SELECT relrowsecurity AS rls, relforcerowsecurity AS force
         FROM pg_class WHERE oid = 'budgeting.investment_history'::regclass`,
    );
    expect(r).toEqual({ rls: true, force: true });
  });

  test("tenant isolation policy is in place", async () => {
    const r = await one<{ n: number }>(
      `SELECT count(*)::int AS n FROM pg_policies
        WHERE schemaname = 'budgeting' AND tablename = 'investment_history'
          AND policyname = 'investment_history_tenant_isolation'`,
    );
    expect(r?.n).toBe(1);
  });

  test("undo columns exist (value delta + deposit prior state)", () => {
    expect(cols.value_delta_cents?.data_type).toBe("bigint");
    expect(cols.value_delta_cents?.is_nullable).toBe("NO");
    expect(cols.value_delta_cents?.column_default).toBe("0");
    expect(cols.prior_principal_cents?.data_type).toBe("bigint");
    expect(cols.prior_start_date?.data_type).toBe("date");
    expect(cols.transfer_id?.data_type).toBe("uuid");
    expect(cols.deleted_at).toBeDefined();
  });

  test("kind CHECK allows the seven kinds and not 'sell'", async () => {
    const r = await one<{ def: string }>(
      `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint
        WHERE conname = 'investment_history_kind_chk'
          AND conrelid = 'budgeting.investment_history'::regclass`,
    );
    for (const k of [
      "start",
      "buy",
      "add",
      "value_change",
      "withdraw",
      "convert_out",
      "convert_in",
    ])
      expect(r!.def).toContain(`'${k}'`);
    expect(r!.def).not.toContain("'sell'");
  });

  test("ui_type CHECK merges equity/etf into stocks", async () => {
    const r = await one<{ def: string }>(
      `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint
        WHERE conname = 'investments_ui_type_chk'`,
    );
    expect(r!.def).toContain("'stocks'");
    for (const legacy of ["equity", "etf", "reit", "etb"])
      expect(r!.def).not.toContain(`'${legacy}'`);
  });

  test("budgets carry a per-budget type-group order", async () => {
    const r = await one<{ data_type: string }>(
      `SELECT data_type FROM information_schema.columns
        WHERE table_schema = 'tenancy' AND table_name = 'budgets'
          AND column_name = 'investment_type_order'`,
    );
    expect(r?.data_type).toBe("ARRAY");
  });

  test("investments keeps FORCE RLS after the backfill", async () => {
    const r = await one<{ force: boolean }>(
      `SELECT relforcerowsecurity AS force FROM pg_class
        WHERE oid = 'budgeting.investments'::regclass`,
    );
    expect(r?.force).toBe(true);
  });
});
