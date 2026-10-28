/**
 * investments-ledger-reconcile.test.ts — gate for drizzle/0089 (13.1 UAT test 12):
 * an asset row is rebuilt from the sum of its live ledger entries.
 *
 * Runs against the shared dev Postgres as the migrator (table owner) inside ONE
 * transaction that always ROLLBACKs in `finally` — 0089's UPDATE is unscoped,
 * so a failed assertion must never commit. 0089 is not journaled yet: 13.1-25
 * applies it after the user reviews scripts/audit-asset-ledger.sql output.
 */
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Pool, type PoolClient } from "pg";

const RAW = process.env.DATABASE_URL_MIGRATOR;
const URL = RAW?.replace("@db:", "@localhost:");
const ROOT = join(import.meta.dir, "../../../..");
const statements = () =>
  readFileSync(join(ROOT, "drizzle/0089_reconcile_asset_ledger.sql"), "utf8")
    .split("--> statement-breakpoint")
    .map((s) => s.trim())
    .filter((s) => s.replace(/^--.*$/gm, "").trim().length > 0);
const AUDIT = readFileSync(
  join(ROOT, "scripts/audit-asset-ledger.sql"),
  "utf8",
);

// UAT's corrupted Bitcoin row on the dev DB — must survive the suite untouched.
const UAT_BTC = "cdc271c4%";
const LIFTED = [
  "identity.users",
  "tenancy.budgets",
  "budgeting.investments",
  "budgeting.investment_history",
];

let pool: Pool;
let realBefore: { quantity: string; buy: string } | undefined;
const realBtc = async () =>
  (
    await pool.query(
      `SELECT quantity::text AS quantity, buy_price_cents::text AS buy
         FROM budgeting.investments WHERE id::text LIKE $1`,
      [UAT_BTC],
    )
  ).rows[0];

beforeAll(async () => {
  if (!URL) return;
  pool = new Pool({ connectionString: URL });
  realBefore = await realBtc();
});
afterAll(async () => {
  if (!pool) return;
  expect(await realBtc()).toEqual(realBefore);
  const bak = await pool.query(
    `SELECT to_regclass('budgeting._investments_bak_0089') IS NULL AS gone`,
  );
  expect(bak.rows[0].gone).toBe(true);
  await pool.end();
});

describe.skipIf(!URL)("Reconcile asset rows with their ledger (0089)", () => {
  test("rebuilds a mismatched row, leaves consistent ones alone, twice is a no-op", async () => {
    const c: PoolClient = await pool.connect();
    const budgetId = crypto.randomUUID();
    const userId = crypto.randomUUID();
    const lift = async () => {
      for (const t of LIFTED)
        await c.query(`ALTER TABLE ${t} NO FORCE ROW LEVEL SECURITY`);
    };
    const run = async () => {
      for (const s of statements()) await c.query(s);
      await lift(); // 0089 restores FORCE; the owner reads back without it
    };
    const row = async (id: string) =>
      (
        await c.query(
          `SELECT quantity::text AS quantity, buy_price_cents::text AS buy
             FROM budgeting.investments WHERE id = $1`,
          [id],
        )
      ).rows[0];
    const audited = async () =>
      (await c.query(AUDIT)).rows
        .filter((r) => r.budget_id === budgetId)
        .map((r) => r.holding_id);

    async function asset(name: string, ui: string, qty: string, buy: number) {
      const id = crypto.randomUUID();
      await c.query(
        `INSERT INTO budgeting.investments
           (id, tenant_id, budget_id, name, holding_type, ui_type, quantity,
            buy_price_cents, buy_currency, current_price_cents, current_price_currency)
         VALUES ($1, $2, $2, $3, $4, $5, $6, $7::bigint, 'USD', $7::bigint, 'USD')`,
        [
          id,
          budgetId,
          name,
          ui === "crypto" ? "crypto" : "other",
          ui,
          qty,
          buy,
        ],
      );
      return id;
    }
    async function entry(
      holdingId: string,
      kind: string,
      qty: string | null,
      cost: number,
      deleted = false,
    ) {
      await c.query(
        `INSERT INTO budgeting.investment_history
           (tenant_id, budget_id, holding_id, kind, effective_date, amount_cents,
            amount_currency, qty_delta, cost_delta_cents, cost_currency,
            flow_cents, flow_currency, deleted_at)
         VALUES ($1, $1, $2, $3, DATE '2026-10-27', $5, 'USD', $4, $5, 'USD', 0, 'USD',
                 CASE WHEN $6 THEN now() END)`,
        [budgetId, holdingId, kind, qty, cost, deleted],
      );
    }

    try {
      await c.query("BEGIN");
      await lift();
      await c.query(
        `INSERT INTO identity.users (id, email, name, email_verified, created_at, updated_at)
         VALUES ($1, $2, 'mig 0089', true, now(), now())`,
        [userId, `mig0089-${userId.slice(0, 8)}@example.com`],
      );
      await c.query(
        `INSERT INTO tenancy.budgets
           (id, slug, name, kind, default_currency, owner_user_id, member_count, created_at, investments_enabled)
         VALUES ($1, $2, 'mig 0089', 'PRIVATE', 'USD', $3, 1, now(), true)`,
        [budgetId, `mig0089-${budgetId.slice(0, 8)}`, userId],
      );

      // A: the UAT Bitcoin shape — row 0.5 / $1,000 while entries sum 2.1.
      const a = await asset("BTC", "crypto", "0.5", 100_000);
      await entry(a, "convert_in", "0.5", 50_000);
      await entry(a, "buy", "0.1", 797_390);
      await entry(a, "buy", "1.5", 11_960_850);
      await entry(a, "transfer_out", "-0.3", -30_000, true);
      // B: consistent quantity asset; C: consistent amount asset.
      const b = await asset("ETH", "crypto", "2", 150_000);
      await entry(b, "start", "2", 300_000);
      const k = await asset("IKE", "broker", "1", 1_600_000);
      await entry(k, "start", null, 1_600_000);
      // D: amount asset whose cost drifted from its entries.
      const d = await asset("IKZE", "broker", "1", 500_000);
      await entry(d, "start", null, 400_000);
      await entry(d, "add", null, 50_000);

      expect((await audited()).sort()).toEqual([a, d].sort());
      const bBefore = await row(b);
      const kBefore = await row(k);

      await run();
      expect(await row(a)).toEqual({
        quantity: "2.10000000",
        buy: String(Math.round(12_808_240 / 2.1)),
      });
      expect(await row(d)).toEqual({ quantity: "1.00000000", buy: "450000" });
      expect(await row(b)).toEqual(bBefore);
      expect(await row(k)).toEqual(kBefore);
      const bak = await c.query(
        `SELECT id FROM budgeting._investments_bak_0089 WHERE budget_id = $1`,
        [budgetId],
      );
      expect(bak.rows.map((r) => r.id).sort()).toEqual([a, d].sort());
      expect(await audited()).toEqual([]);

      const aAfter = await row(a);
      await run();
      expect(await row(a)).toEqual(aAfter);
      expect(await audited()).toEqual([]);
    } finally {
      await c.query("ROLLBACK");
      c.release();
    }
  });
});
