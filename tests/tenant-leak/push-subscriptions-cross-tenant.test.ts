/**
 * push-subscriptions-cross-tenant.test.ts — Tenant-leak gate test for
 * `shared_kernel.push_subscriptions` (Phase 8, Plan 08-01).
 *
 * Layer 2 — RLS / DB:
 *   Two tenants each have a push subscription. Under app_role with GUC set to
 *   tenantB's id, SELECT on tenantA's subscription must return 0 rows.
 *
 * Gate accounting (`make ci-gate` → tests/tenant-leak/*.test.ts):
 *   - force-rls-on-all-tables  (covers push_subscriptions via USER-DATA-TABLES.txt)
 *   - push-subscriptions-cross-tenant  (THIS FILE)
 * Total: +1 to the gate count (8 → 9 cross-tenant files after adding notification-prefs).
 */
import { describe, it, expect, beforeAll } from "bun:test";
import { Pool } from "pg";

const DB_URL_RAW = process.env.DATABASE_URL_APP;
if (!DB_URL_RAW)
  throw new Error("DATABASE_URL_APP required for tenant-leak gate tests");
process.env.DATABASE_URL_APP = DB_URL_RAW.replace("@db:", "@localhost:");
const DB_URL = process.env.DATABASE_URL_APP;

interface SeededSub {
  tenantId: string;
  userId: string;
  subId: string;
}

async function seedPushSubscription(): Promise<SeededSub> {
  const pool = new Pool({ connectionString: DB_URL });
  const client = await pool.connect();
  const tenantId = crypto.randomUUID();
  const userId = crypto.randomUUID();
  const subId = crypto.randomUUID();
  try {
    await client.query("BEGIN");
    // app_role is under FORCE RLS — set the tenant GUC so the INSERT's
    // withCheck (tenant_id = ANY(app.tenant_ids)) passes during seed.
    await client.query(`SELECT set_config('app.tenant_ids', $1, false)`, [
      `{"${tenantId}"}`,
    ]);
    await client.query(
      `INSERT INTO shared_kernel.push_subscriptions
         (id, tenant_id, user_id, endpoint, p256dh, auth, locale, created_at)
       VALUES ($1, $2, $3, $4, 'p256dh-value', 'auth-value', 'en', now())`,
      [subId, tenantId, userId, `https://fcm.example.com/sub-${subId}`],
    );
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
    await pool.end();
  }
  return { tenantId, userId, subId };
}

describe("push_subscriptions tenant isolation (RLS)", () => {
  let subA: SeededSub;
  let subB: SeededSub;

  beforeAll(async () => {
    subA = await seedPushSubscription();
    subB = await seedPushSubscription();
  });

  it("Layer 2 (RLS): app_role with tenantB GUC cannot SELECT tenantA's push subscription", async () => {
    const pool = new Pool({ connectionString: DB_URL });
    const client = await pool.connect();
    try {
      await client.query("SET ROLE app_role");
      await client.query(`SELECT set_config('app.tenant_ids', $1, false)`, [
        `{"${subB.tenantId}"}`,
      ]);
      const result = await client.query(
        `SELECT id FROM shared_kernel.push_subscriptions WHERE id = $1`,
        [subA.subId],
      );
      expect(result.rows.length).toBe(0);
    } finally {
      client.release();
      await pool.end();
    }
  });

  it("Layer 2 sanity: app_role with tenantA GUC CAN SELECT tenantA's push subscription", async () => {
    const pool = new Pool({ connectionString: DB_URL });
    const client = await pool.connect();
    try {
      await client.query("SET ROLE app_role");
      await client.query(`SELECT set_config('app.tenant_ids', $1, false)`, [
        `{"${subA.tenantId}"}`,
      ]);
      const result = await client.query(
        `SELECT id FROM shared_kernel.push_subscriptions WHERE id = $1`,
        [subA.subId],
      );
      expect(result.rows.length).toBe(1);
      expect(result.rows[0].id).toBe(subA.subId);
    } finally {
      client.release();
      await pool.end();
    }
  });
});
