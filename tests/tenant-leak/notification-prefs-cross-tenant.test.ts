/**
 * notification-prefs-cross-tenant.test.ts — Tenant-leak gate test for
 * `shared_kernel.notification_prefs` (Phase 8, Plan 08-01).
 *
 * Layer 2 — RLS / DB:
 *   Two tenants each have a notification_pref row. Under app_role with GUC set
 *   to tenantB's id, SELECT on tenantA's pref must return 0 rows.
 *
 * Gate accounting (`make ci-gate` → tests/tenant-leak/*.test.ts):
 *   - force-rls-on-all-tables  (covers notification_prefs via USER-DATA-TABLES.txt)
 *   - notification-prefs-cross-tenant  (THIS FILE)
 * Total: +1 to the gate count (8 → 10 cross-tenant files with push-subscriptions).
 */
import { describe, it, expect, beforeAll } from "bun:test";
import { Pool } from "pg";

const DB_URL_RAW = process.env.DATABASE_URL_APP;
if (!DB_URL_RAW)
  throw new Error("DATABASE_URL_APP required for tenant-leak gate tests");
process.env.DATABASE_URL_APP = DB_URL_RAW.replace("@db:", "@localhost:");
const DB_URL = process.env.DATABASE_URL_APP;

interface SeededPref {
  tenantId: string;
  userId: string;
  prefId: string;
}

async function seedNotificationPref(): Promise<SeededPref> {
  const pool = new Pool({ connectionString: DB_URL });
  const client = await pool.connect();
  const tenantId = crypto.randomUUID();
  const userId = crypto.randomUUID();
  const budgetId = tenantId; // budget_id == tenant_id for PRIVATE budgets
  const prefId = crypto.randomUUID();
  try {
    await client.query("BEGIN");
    // app_role is under FORCE RLS — set the tenant GUC so the INSERT's
    // withCheck (tenant_id = ANY(app.tenant_ids)) passes during seed.
    await client.query(`SELECT set_config('app.tenant_ids', $1, false)`, [
      `{"${tenantId}"}`,
    ]);
    await client.query(
      `INSERT INTO shared_kernel.notification_prefs
         (id, tenant_id, user_id, budget_id, notification_type, enabled, updated_at)
       VALUES ($1, $2, $3, $4, 'RESERVE_TOPUP', true, now())`,
      [prefId, tenantId, userId, budgetId],
    );
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
    await pool.end();
  }
  return { tenantId, userId, prefId };
}

describe("notification_prefs tenant isolation (RLS)", () => {
  let prefA: SeededPref;
  let prefB: SeededPref;

  beforeAll(async () => {
    prefA = await seedNotificationPref();
    prefB = await seedNotificationPref();
  });

  it("Layer 2 (RLS): app_role with tenantB GUC cannot SELECT tenantA's notification_pref", async () => {
    const pool = new Pool({ connectionString: DB_URL });
    const client = await pool.connect();
    try {
      await client.query("SET ROLE app_role");
      await client.query(`SELECT set_config('app.tenant_ids', $1, false)`, [
        `{"${prefB.tenantId}"}`,
      ]);
      const result = await client.query(
        `SELECT id FROM shared_kernel.notification_prefs WHERE id = $1`,
        [prefA.prefId],
      );
      expect(result.rows.length).toBe(0);
    } finally {
      client.release();
      await pool.end();
    }
  });

  it("Layer 2 sanity: app_role with tenantA GUC CAN SELECT tenantA's notification_pref", async () => {
    const pool = new Pool({ connectionString: DB_URL });
    const client = await pool.connect();
    try {
      await client.query("SET ROLE app_role");
      await client.query(`SELECT set_config('app.tenant_ids', $1, false)`, [
        `{"${prefA.tenantId}"}`,
      ]);
      const result = await client.query(
        `SELECT id FROM shared_kernel.notification_prefs WHERE id = $1`,
        [prefA.prefId],
      );
      expect(result.rows.length).toBe(1);
      expect(result.rows[0].id).toBe(prefA.prefId);
    } finally {
      client.release();
      await pool.end();
    }
  });
});
