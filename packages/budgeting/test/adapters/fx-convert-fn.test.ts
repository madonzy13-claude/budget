/**
 * fx-convert-fn.test.ts — budgeting.fx_convert(cents, src, dst, on_date), the
 * ONE place Phase 14 read-time conversion rounds and falls back (migration 0104).
 *
 * Semantics mirror CacheOnlyFxProvider: the rate on the date, else the most
 * recent prior rate, else (date before all history) the earliest; an unknown
 * pair is NULL — never a fabricated rate of 1. Rounding is half away from zero
 * (Postgres round(numeric)), the same as Big.roundHalfUp, so refunds mirror.
 *
 * A synthetic pair (ZZA→ZZB) keeps the seeded rates off real history.
 * Real Postgres — run under `infisical run --env=dev`.
 */
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { Pool } from "pg";
import Big from "big.js";
import { seedFxRates, deleteFxRates } from "../fx-seed";

const APP = process.env.DATABASE_URL_APP?.replace("@db:", "@localhost:");
const MIGRATOR = process.env.DATABASE_URL_MIGRATOR?.replace("@db:", "@localhost:");
const PROVIDER = `test-0104-${crypto.randomUUID()}`;

// D1 / D3 seeded, D2 deliberately missing (prior-rate fallback).
const D1 = "1999-01-04";
const D2 = "1999-01-05";
const D3 = "1999-01-06";
const R1 = "0.5";
const R3 = "4.27310000";

let app: Pool;

const convert = async (
  cents: bigint | number,
  src: string,
  dst: string,
  on: string,
): Promise<string | null> => {
  const r = await app.query<{ v: string | null }>(
    `SELECT budgeting.fx_convert($1::bigint, $2, $3, $4::date)::text AS v`,
    [cents.toString(), src, dst, on],
  );
  return r.rows[0]!.v;
};

describe.skipIf(!APP || !MIGRATOR)("budgeting.fx_convert", () => {
  beforeAll(async () => {
    app = new Pool({ connectionString: APP });
    await seedFxRates(
      [
        { base: "ZZA", quote: "ZZB", date: D1, rate: R1 },
        { base: "ZZA", quote: "ZZB", date: D3, rate: R3 },
      ],
      PROVIDER,
    );
  });

  afterAll(async () => {
    await deleteFxRates(PROVIDER);
    await app?.end();
  });

  test("same currency returns the cents unchanged", async () => {
    expect(await convert(12345, "PLN", "PLN", "2026-01-01")).toBe("12345");
  });

  test("uses the rate on the date", async () => {
    expect(await convert(1000, "ZZA", "ZZB", D1)).toBe("500");
    expect(await convert(1000, "ZZA", "ZZB", D3)).toBe("4273");
  });

  test("falls back to the most recent prior rate", async () => {
    expect(await convert(1000, "ZZA", "ZZB", D2)).toBe("500");
    expect(await convert(1000, "ZZA", "ZZB", "2030-01-01")).toBe("4273");
  });

  test("before all history uses the earliest rate", async () => {
    expect(await convert(1000, "ZZA", "ZZB", "1990-01-01")).toBe("500");
  });

  test("rounds half away from zero, so a refund mirrors a payment", async () => {
    expect(await convert(1, "ZZA", "ZZB", D1)).toBe("1");
    expect(await convert(-1, "ZZA", "ZZB", D1)).toBe("-1");
    expect(await convert(3, "ZZA", "ZZB", D1)).toBe("2");
    expect(await convert(-3, "ZZA", "ZZB", D1)).toBe("-2");
  });

  test("matches Big.roundHalfUp for random amounts incl. negatives", async () => {
    for (let i = 0; i < 50; i++) {
      const cents = Math.floor(Math.random() * 2_000_000) - 1_000_000;
      const want = new Big(cents).times(R3).round(0, Big.roundHalfUp).toFixed(0);
      expect(await convert(cents, "ZZA", "ZZB", D3)).toBe(want);
    }
  });

  test("an unknown pair is NULL, never a fabricated rate of 1", async () => {
    expect(await convert(1000, "XXX", "PLN", "2026-01-01")).toBeNull();
  });

  test("grouped conversion over the largest budget is index-backed and fast", async () => {
    // Discover the biggest ledger as postgres (FORCE RLS hides rows from
    // every other role), then measure as app_role with the tenant GUC set.
    const su = new Pool({
      connectionString: MIGRATOR!.replace(
        /\/\/[^:]+:[^@]+@/,
        `//postgres:${process.env.POSTGRES_PASSWORD}@`,
      ),
    });
    const big = await su.query<{ tenant_id: string; ccy: string }>(
      `SELECT l.tenant_id, b.default_currency AS ccy
         FROM budgeting.expense_ledger l
         JOIN tenancy.budgets b ON b.id = l.tenant_id
        GROUP BY 1, 2 ORDER BY count(*) DESC LIMIT 1`,
    );
    await su.end();
    const row = big.rows[0];
    if (!row) return;

    const c = await app.connect();
    try {
      await c.query("BEGIN");
      await c.query(`SELECT set_config('app.tenant_ids', $1, true)`, [
        `{${row.tenant_id}}`,
      ]);
      const q = `SELECT l.category_id, date_trunc('month', l.transaction_date) m,
                        SUM(budgeting.fx_convert(l.amount_original_cents, l.currency_original,
                                                 $1, l.transaction_date))
                   FROM budgeting.expense_ledger l
                  WHERE l.tenant_id = $2::uuid
                  GROUP BY 1, 2`;
      await c.query(q, [row.ccy === "EUR" ? "PLN" : "EUR", row.tenant_id]); // warm
      const t0 = performance.now();
      await c.query(q, [row.ccy === "EUR" ? "PLN" : "EUR", row.tenant_id]);
      expect(performance.now() - t0).toBeLessThan(500);

      const plan = await c.query<{ "QUERY PLAN": string }>(
        `EXPLAIN SELECT budgeting.fx_convert(l.amount_original_cents, l.currency_original,
                                             'EUR', l.transaction_date)
           FROM budgeting.expense_ledger l WHERE l.tenant_id = $1::uuid`,
        [row.tenant_id],
      );
      const text = plan.rows.map((r) => r["QUERY PLAN"]).join("\n");
      expect(text).not.toContain("Seq Scan on fx_rates");
      await c.query("ROLLBACK");
    } finally {
      c.release();
    }
  });
});
