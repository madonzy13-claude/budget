/**
 * investment-old-deletes-0097.test.ts — gate for drizzle/0097 (13.1 round 6,
 * user): before phase 13.1 the asset "Delete" only archived the row, so
 * removed assets resurfaced in the name autocomplete as "Archived" with their
 * old value. Those rows (archived before 13.1, nothing ever left them) are
 * deleted with their ledger; a sold-out auto-archive and anything archived
 * since stay.
 *
 * Runs on the shared dev Postgres as the migrator inside ONE transaction that
 * always ROLLBACKs — nothing (rows, backup tables) survives the suite.
 */
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Pool } from "pg";

const URL = process.env.DATABASE_URL_MIGRATOR?.replace("@db:", "@localhost:");
const ROOT = join(import.meta.dir, "../../../..");
const statements = () =>
  readFileSync(
    join(ROOT, "drizzle/0097_delete_pre_13_1_removed_assets.sql"),
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
  await pool?.end();
});

describe.skipIf(!URL)("Delete assets removed before 13.1 (0097)", () => {
  test("old deletes go with their ledger; sold-out and recent archives stay", async () => {
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
    const asset = async (archivedAt: string | null, entryKind?: string) => {
      const id = crypto.randomUUID();
      await c.query(
        `INSERT INTO budgeting.investments
           (id, tenant_id, budget_id, name, holding_type, ui_type, quantity,
            buy_price_cents, buy_currency, current_price_cents, current_price_currency,
            archived_at)
         VALUES ($1, $2, $2, 'x', 'other', 'collectibles', 5, 100, 'PLN', 100, 'PLN', $3)`,
        [id, budgetId, archivedAt],
      );
      for (const kind of ["start", ...(entryKind ? [entryKind] : [])])
        await c.query(
          `INSERT INTO budgeting.investment_history
             (tenant_id, budget_id, holding_id, kind, effective_date,
              amount_cents, amount_currency, cost_delta_cents, cost_currency,
              flow_cents, flow_currency)
           VALUES ($1, $1, $2, $3, DATE '2026-07-01', 500, 'PLN', 500, 'PLN', 0, 'PLN')`,
          [budgetId, id, kind],
        );
      return id;
    };
    const exists = async (id: string) =>
      (await c.query(`SELECT 1 FROM budgeting.investments WHERE id = $1`, [id]))
        .rowCount === 1;
    const entries = async (id: string) =>
      (
        await c.query(
          `SELECT count(*)::int AS n FROM budgeting.investment_history WHERE holding_id = $1`,
          [id],
        )
      ).rows[0].n as number;

    try {
      await c.query("BEGIN");
      await lift();
      await c.query(
        `INSERT INTO identity.users (id, email, name, email_verified, created_at, updated_at)
         VALUES ($1, $2, 'mig 0097', true, now(), now())`,
        [userId, `mig0097-${userId.slice(0, 8)}@example.com`],
      );
      await c.query(
        `INSERT INTO tenancy.budgets
           (id, slug, name, kind, default_currency, owner_user_id, member_count, created_at, investments_enabled)
         VALUES ($1, $2, 'mig 0097', 'PRIVATE', 'PLN', $3, 1, now(), true)`,
        [budgetId, `mig0097-${budgetId.slice(0, 8)}`, userId],
      );
      const removed = await asset("2026-07-12 05:53:12+00", "buy");
      const soldOut = await asset("2026-10-27 09:44:13+00", "convert_out");
      const withdrawn = await asset("2026-08-01 10:00:00+00", "withdraw");
      const movedOut = await asset("2026-08-01 10:00:00+00", "transfer_out");
      const archivedSince = await asset("2026-10-29 16:38:29+00");
      const live = await asset(null);

      await run();
      expect(await exists(removed)).toBe(false);
      expect(await entries(removed)).toBe(0);
      for (const id of [soldOut, withdrawn, movedOut, archivedSince, live])
        expect(await exists(id)).toBe(true);
      const bak = await c.query(
        `SELECT (SELECT count(*)::int FROM budgeting._investments_bak_0097 WHERE id = $1) AS h,
                (SELECT count(*)::int FROM budgeting._investment_history_bak_0097 WHERE holding_id = $1) AS e`,
        [removed],
      );
      expect(bak.rows[0]).toEqual({ h: 1, e: 2 });

      await run();
      for (const id of [soldOut, withdrawn, movedOut, archivedSince, live])
        expect(await exists(id)).toBe(true);
    } finally {
      await c.query("ROLLBACK");
      c.release();
    }
  });
});
