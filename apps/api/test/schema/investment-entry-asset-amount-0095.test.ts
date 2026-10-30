/**
 * investment-entry-asset-amount-0095.test.ts — gate for drizzle/0095 (13.1
 * round-6 gap 2): existing cross-currency entries get their deal figure only
 * where it is exactly recoverable; everything else stays NULL.
 *
 * Runs on the shared dev Postgres as the migrator inside ONE transaction that
 * always ROLLBACKs — nothing (rows, backup table) survives the suite.
 */
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Pool } from "pg";

const URL = process.env.DATABASE_URL_MIGRATOR?.replace("@db:", "@localhost:");
const ROOT = join(import.meta.dir, "../../../..");
const statements = () =>
  readFileSync(
    join(ROOT, "drizzle/0095_backfill_entry_asset_amount.sql"),
    "utf8",
  )
    .split("--> statement-breakpoint")
    .map((s) => s.trim())
    .filter((s) => s.replace(/^--.*$/gm, "").trim().length > 0);
const LIFTED = [
  "identity.users",
  "tenancy.budgets",
  "budgeting.investments",
  "budgeting.investment_history",
];

let pool: Pool;
beforeAll(() => {
  if (URL) pool = new Pool({ connectionString: URL });
});
afterAll(async () => {
  if (!pool) return;
  const bak = await pool.query(
    `SELECT to_regclass('budgeting._investments_bak_0095') IS NULL AS gone`,
  );
  expect(bak.rows[0].gone).toBe(true);
  await pool.end();
});

describe.skipIf(!URL)("Backfill the deal figure (0095)", () => {
  test("exact rows filled, the rest left NULL, twice is a no-op", async () => {
    const c = await pool.connect();
    const budgetId = crypto.randomUUID();
    const userId = crypto.randomUUID();
    const lift = async () => {
      for (const t of LIFTED)
        await c.query(`ALTER TABLE ${t} NO FORCE ROW LEVEL SECURITY`);
    };
    const run = async () => {
      for (const s of statements()) await c.query(s);
      await lift();
    };
    const asset = async (ccy: string) => {
      const id = crypto.randomUUID();
      await c.query(
        `INSERT INTO budgeting.investments
           (id, tenant_id, budget_id, name, holding_type, ui_type, quantity,
            buy_price_cents, buy_currency, current_price_cents, current_price_currency)
         VALUES ($1, $2, $2, 'x', 'other', 'collectibles', 1, 0, $3, 0, $3)`,
        [id, budgetId, ccy],
      );
      return id;
    };
    const entry = async (
      holdingId: string,
      kind: string,
      amountCcy: string,
      costCcy: string,
      cost: number,
      sold: number | null,
      realized: number | null,
      budgetCcy: string | null,
    ) =>
      (
        await c.query(
          `INSERT INTO budgeting.investment_history
             (tenant_id, budget_id, holding_id, kind, effective_date,
              amount_cents, amount_currency, cost_delta_cents, cost_currency,
              flow_cents, flow_currency, sold_cost_budget_cents,
              realized_budget_cents, budget_currency)
           VALUES ($1, $1, $2, $3, DATE '2026-10-28', 69000, $4, $6, $5,
                   0, $4, $7, $8, $9)
           RETURNING id`,
          [
            budgetId,
            holdingId,
            kind,
            amountCcy,
            costCcy,
            cost,
            sold,
            realized,
            budgetCcy,
          ],
        )
      ).rows[0].id as string;
    const figure = async (id: string) =>
      (
        await c.query(
          `SELECT asset_amount_cents::text AS a FROM budgeting.investment_history WHERE id = $1`,
          [id],
        )
      ).rows[0].a as string | null;

    try {
      await c.query("BEGIN");
      await lift();
      await c.query(
        `INSERT INTO identity.users (id, email, name, email_verified, created_at, updated_at)
         VALUES ($1, $2, 'mig 0095', true, now(), now())`,
        [userId, `mig0095-${userId.slice(0, 8)}@example.com`],
      );
      await c.query(
        `INSERT INTO tenancy.budgets
           (id, slug, name, kind, default_currency, owner_user_id, member_count, created_at, investments_enabled)
         VALUES ($1, $2, 'mig 0095', 'PRIVATE', 'PLN', $3, 1, now(), true)`,
        [budgetId, `mig0095-${budgetId.slice(0, 8)}`, userId],
      );
      const pln = await asset("PLN");
      const usd = await asset("USD");
      // Diamonds: sold 690 EUR, cost 3,000 PLN, realized 0, budget PLN.
      const diamonds = await entry(
        pln,
        "convert_out",
        "EUR",
        "PLN",
        -300000,
        300000,
        0,
        "PLN",
      );
      const buy = await entry(
        pln,
        "buy",
        "EUR",
        "PLN",
        42500,
        null,
        null,
        null,
      );
      // Budget PLN, asset USD: only a rounded back-derivation exists.
      const usdSale = await entry(
        usd,
        "withdraw",
        "PLN",
        "USD",
        -10000,
        40000,
        2000,
        "PLN",
      );
      // Same currency: nothing to convert.
      const same = await entry(
        pln,
        "add",
        "PLN",
        "PLN",
        5000,
        null,
        null,
        null,
      );

      await run();
      expect(await figure(diamonds)).toBe("300000");
      expect(await figure(buy)).toBe("42500");
      expect(await figure(usdSale)).toBeNull();
      expect(await figure(same)).toBeNull();
      const bak = await c.query(
        `SELECT count(*)::int AS n FROM budgeting._investments_bak_0095 WHERE id = ANY($1)`,
        [[diamonds, buy]],
      );
      expect(bak.rows[0].n).toBe(2);

      await run();
      expect(await figure(diamonds)).toBe("300000");
    } finally {
      await c.query("ROLLBACK");
      c.release();
    }
  });
});
