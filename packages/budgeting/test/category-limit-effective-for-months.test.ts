/**
 * effectiveForMonths must return exactly what effectiveForMonth returned.
 *
 * The reserve replay asked for limits one month at a time — 35 transactions on
 * a three-year budget, each carrying two SET LOCAL statements for the RLS GUCs.
 * A single all-budgets request issued 424 such lookups. Batching them is only
 * safe if the batched answer is identical per month, so that is what this
 * asserts: the two are compared month by month against the same data.
 */
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { Pool } from "pg";
import { startTestcontainer } from "@budget/db/test/testcontainer";
import { DrizzleCategoryLimitRepo } from "../src/adapters/persistence/category-limit-repo";

let pool: Pool;
const TENANT = "cc110000-0000-4000-8000-000000000001";
const OWNER = "cc110000-0000-4000-8000-000000000002";
const CAT_A = "cc110000-0000-4000-8000-00000000000a";
const CAT_B = "cc110000-0000-4000-8000-00000000000b";

const MONTHS = [
  "2026-01-01",
  "2026-02-01",
  "2026-03-01",
  "2026-04-01",
  "2026-05-01",
];

beforeAll(async () => {
  const { urlApp } = await startTestcontainer();
  pool = new Pool({ connectionString: urlApp });
  const c = await pool.connect();
  try {
    await c.query(`SELECT set_config('app.tenant_ids', $1, false)`, [
      `{${TENANT}}`,
    ]);
    await c.query(`SELECT set_config('app.current_user_id', $1, false)`, [
      OWNER,
    ]);
    await c.query(
      `INSERT INTO tenancy.budgets (id, slug, name, default_currency, owner_user_id, created_at)
       VALUES ($1, 'eff-months-test', 'b', 'PLN', $2, now()) ON CONFLICT (id) DO NOTHING`,
      [TENANT, OWNER],
    );
    for (const [id, name] of [
      [CAT_A, "A"],
      [CAT_B, "B"],
    ] as const) {
      await c.query(
        `INSERT INTO budgeting.categories (id, tenant_id, name, created_at, actor_user_id, sort_index)
         VALUES ($1, $2, $3, now(), $4, 0) ON CONFLICT (id) DO NOTHING`,
        [id, TENANT, name, OWNER],
      );
    }
    // An SCD-2 history with a real boundary: A changes in March, B starts in
    // April and is unbounded. A month-by-month walk and a batch must agree on
    // both the change and the gap.
    const rows: Array<[string, string, number, string | null, boolean]> = [
      [CAT_A, "2026-01-01", 100000, "2026-03-01", false],
      [CAT_A, "2026-03-01", 250000, null, false],
      [CAT_B, "2026-04-01", 0, null, true],
    ];
    for (const [cat, from, amount, to, noLimit] of rows) {
      await c.query(
        `INSERT INTO budgeting.category_limits
           (id, tenant_id, category_id, normal_amount, normal_currency,
            cushion_amount, cushion_currency, effective_from, effective_to,
            no_limit, actor_user_id, created_at)
         VALUES (gen_random_uuid(), $1, $2, $3, 'PLN', $4, 'PLN', $5::date, $6::date, $7, $8, now())`,
        [TENANT, cat, amount, Math.round(amount / 2), from, to, noLimit, OWNER],
      );
    }
  } finally {
    c.release();
  }
}, 180_000);

afterAll(async () => {
  await pool?.end();
});

describe("effectiveForMonths", () => {
  test("matches effectiveForMonth for every month", async () => {
    const repo = new DrizzleCategoryLimitRepo();
    const batched = await repo.effectiveForMonths(TENANT, TENANT, MONTHS);

    for (const m of MONTHS) {
      const single = await repo.effectiveForMonth(TENANT, TENANT, m);
      const fromBatch = batched.get(m);
      expect({ month: m, present: fromBatch !== undefined }).toEqual({
        month: m,
        present: true,
      });
      // Same categories, same numbers — compared as plain objects so a
      // mismatch names the month and the field.
      const norm = (
        map: Map<
          string,
          { planned: bigint; cushion: bigint; noLimit: boolean }
        >,
      ) =>
        [...map.entries()]
          .map(([k, v]) => [k, String(v.planned), String(v.cushion), v.noLimit])
          .sort();
      expect({ month: m, rows: norm(fromBatch!) }).toEqual({
        month: m,
        rows: norm(single),
      });
    }
  });

  test("sees the SCD-2 boundary in the right month", async () => {
    // Guards the join predicate itself: a batch that ignored the month would
    // still pass the comparison above if BOTH sides were wrong the same way.
    const repo = new DrizzleCategoryLimitRepo();
    const batched = await repo.effectiveForMonths(TENANT, TENANT, MONTHS);
    expect(String(batched.get("2026-02-01")!.get(CAT_A)!.planned)).toBe(
      "100000",
    );
    expect(String(batched.get("2026-03-01")!.get(CAT_A)!.planned)).toBe(
      "250000",
    );
  });

  test("a month with no limits still gets an entry", async () => {
    // Callers must not have to tell "no limits that month" apart from "never
    // asked". B does not exist before April.
    const repo = new DrizzleCategoryLimitRepo();
    const batched = await repo.effectiveForMonths(TENANT, TENANT, MONTHS);
    expect(batched.get("2026-01-01")!.has(CAT_B)).toBe(false);
    expect(batched.get("2026-04-01")!.has(CAT_B)).toBe(true);
  });

  test("an empty month list is not a query", async () => {
    const repo = new DrizzleCategoryLimitRepo();
    const batched = await repo.effectiveForMonths(TENANT, TENANT, []);
    expect(batched.size).toBe(0);
  });
});
