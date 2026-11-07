/**
 * investment-category-removed-0109.test.ts — gate for drizzle/0109 (15-18 UAT,
 * user): the special "Investments" spendings category is gone. Its two columns
 * and the one-per-budget index are dropped; any row that was that category
 * stays as an ordinary category with its spendings.
 */
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { Pool } from "pg";

const URL = process.env.DATABASE_URL_MIGRATOR?.replace("@db:", "@localhost:");

let pool: Pool;
beforeAll(() => {
  if (URL) pool = new Pool({ connectionString: URL });
});
afterAll(async () => {
  await pool?.end();
});

describe.skipIf(!URL)("Investments spendings category removed (0109)", () => {
  test("categories has no is_investment / investment_limit_mode and no one-per-budget index", async () => {
    const cols = await pool.query(
      `SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'budgeting' AND table_name = 'categories'
          AND column_name IN ('is_investment', 'investment_limit_mode')`,
    );
    expect(cols.rows).toEqual([]);
    const idx = await pool.query(
      `SELECT 1 FROM pg_indexes WHERE indexname = 'categories_one_investment_per_tenant'`,
    );
    expect(idx.rows).toEqual([]);
  });
});
