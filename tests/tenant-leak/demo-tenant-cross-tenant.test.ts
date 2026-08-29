/**
 * Demo tenant isolation — the guarantee the demo account rests on.
 *
 * The demo is a SHARED, publicly-credentialed login living in the same database
 * as the owner's real finances. Its isolation is not a rule anyone has to
 * remember: the demo user holds `tenancy.budget_members` rows for the demo
 * budgets and nothing else, and RLS derives `app.tenant_ids` from exactly those
 * rows. This file proves that, so nobody has to take it on trust.
 *
 * Deliberately NO second mechanism. A guard bolted on top of RLS would be a
 * second thing that can be wrong, and would let the first quietly rot.
 *
 * The table list is parsed from USER-DATA-TABLES.txt at RUNTIME, so a table
 * added by a later phase is covered here without anyone remembering to edit
 * this file.
 *
 * T-13 (green-washing): to check this gate can fail, flip app_role to BYPASSRLS
 * in post-migration.sql and rerun — every assertion below must go red.
 */
import { describe, it, expect, beforeAll } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { startTestcontainer } from "@budget/db/test/testcontainer";
import { rawAppClient } from "./fixtures/raw-pg-client";

const TABLES_FILE = resolve(import.meta.dir, "USER-DATA-TABLES.txt");

const OWNER_TENANT = "aaaaaaaa-0000-4000-8000-000000000001";
const DEMO_TENANT = "bbbbbbbb-0000-4000-8000-000000000002";
const OWNER_USER = "cccccccc-0000-4000-8000-000000000003";
const DEMO_USER = "dddddddd-0000-4000-8000-000000000004";

function tenantScopedTables(): string[] {
  return readFileSync(TABLES_FILE, "utf8")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"))
    .map((l) => l.split(/\s+/))
    .filter((p) => p[1] === "TENANT-SCOPED")
    .map((p) => p[0]!);
}

/** Tables whose RLS predicate keys on tenant_id (the ones this test can probe). */
async function probeableTables(): Promise<string[]> {
  const c = rawAppClient();
  await c.connect();
  try {
    const { rows } = await c.query<{ t: string }>(
      `SELECT table_schema || '.' || table_name AS t
         FROM information_schema.columns
        WHERE column_name = 'tenant_id'`,
    );
    const withTenantId = new Set(rows.map((r) => r.t));
    return tenantScopedTables().filter((t) => withTenantId.has(t));
  } finally {
    await c.end();
  }
}

beforeAll(async () => {
  await startTestcontainer();

  const c = rawAppClient();
  await c.connect();
  try {
    // Owner tenant, with a row in every probeable table's parent so the probe
    // has something to (fail to) see. Categories is enough: the assertion is
    // "zero owner rows visible", and a table with no owner rows would pass
    // vacuously — so we seed the owner tenant with real content first.
    await c.query(`SELECT set_config('app.tenant_ids', $1, false)`, [
      `{${OWNER_TENANT},${DEMO_TENANT}}`,
    ]);
    await c.query(`SELECT set_config('app.current_user_id', $1, false)`, [
      OWNER_USER,
    ]);

    for (const [id, slug, owner] of [
      [OWNER_TENANT, "owner-budget", OWNER_USER],
      [DEMO_TENANT, "demo-budget", DEMO_USER],
    ] as const) {
      await c.query(
        `INSERT INTO tenancy.budgets (id, slug, name, default_currency, owner_user_id, created_at)
         VALUES ($1, $2, 'b', 'PLN', $3, now()) ON CONFLICT (id) DO NOTHING`,
        [id, slug, owner],
      );
    }
    await c.query(
      `INSERT INTO budgeting.categories (id, tenant_id, name, created_at, actor_user_id, sort_index)
       VALUES (gen_random_uuid(), $1, 'OWNER SECRET', now(), $2, 0)`,
      [OWNER_TENANT, OWNER_USER],
    );
    await c.query(
      `INSERT INTO budgeting.wallets (id, tenant_id, name, currency, current_balance, created_at, actor_user_id)
       VALUES (gen_random_uuid(), $1, 'OWNER WALLET', 'PLN', 9999.0000, now(), $2)`,
      [OWNER_TENANT, OWNER_USER],
    );

    // Membership: the owner on the owner budget, the demo user on the demo
    // budget. This — and only this — is what makes the demo user isolated.
    await c.query(
      `INSERT INTO tenancy.budget_members (id, budget_id, user_id, role, created_at)
       VALUES (gen_random_uuid(), $1, $2, 'owner', now()),
              (gen_random_uuid(), $3, $4, 'owner', now())`,
      [OWNER_TENANT, OWNER_USER, DEMO_TENANT, DEMO_USER],
    );
  } finally {
    await c.end();
  }
}, 180_000);

/**
 * Resolves tenant_ids the way the application does: from budget_members, for
 * the signed-in user. NOT hand-set to the demo tenant — hand-setting it would
 * test the test rather than the app.
 */
async function tenantIdsFor(userId: string): Promise<string[]> {
  const c = rawAppClient();
  await c.connect();
  try {
    await c.query(`SELECT set_config('app.current_user_id', $1, false)`, [
      userId,
    ]);
    const { rows } = await c.query<{ budget_id: string }>(
      `SELECT budget_id FROM tenancy.budget_members WHERE user_id = $1`,
      [userId],
    );
    return rows.map((r) => r.budget_id);
  } finally {
    await c.end();
  }
}

describe("Demo tenant isolation", () => {
  it("the demo user's membership names the demo budget and nothing else", async () => {
    const ids = await tenantIdsFor(DEMO_USER);
    expect(ids).toEqual([DEMO_TENANT]);
    expect(ids).not.toContain(OWNER_TENANT);
  });

  it("a demo session reads zero owner rows from every tenant-scoped table", async () => {
    const tables = await probeableTables();
    expect(tables.length).toBeGreaterThan(10); // the list really did parse

    const ids = await tenantIdsFor(DEMO_USER);
    const c = rawAppClient();
    await c.connect();
    try {
      await c.query(`SELECT set_config('app.current_user_id', $1, false)`, [
        DEMO_USER,
      ]);
      await c.query(`SELECT set_config('app.tenant_ids', $1, false)`, [
        `{${ids.join(",")}}`,
      ]);

      for (const table of tables) {
        const { rows } = await c.query<{ n: number }>(
          `SELECT count(*)::int AS n FROM ${table} WHERE tenant_id = $1`,
          [OWNER_TENANT],
        );
        expect({ table, n: rows[0]!.n }).toEqual({ table, n: 0 });
      }
    } finally {
      await c.end();
    }
  });

  it("the owner's rows really are there — the probe is not passing vacuously", async () => {
    // Without this, every assertion above would also pass against an empty
    // database, and the gate would be decorative.
    const c = rawAppClient();
    await c.connect();
    try {
      await c.query(`SELECT set_config('app.current_user_id', $1, false)`, [
        OWNER_USER,
      ]);
      await c.query(`SELECT set_config('app.tenant_ids', $1, false)`, [
        `{${OWNER_TENANT}}`,
      ]);
      const { rows } = await c.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM budgeting.categories WHERE tenant_id = $1`,
        [OWNER_TENANT],
      );
      expect(rows[0]!.n).toBeGreaterThan(0);
    } finally {
      await c.end();
    }
  });

  it("the probe would CATCH a leak — it is not structurally incapable of failing", async () => {
    // Self-test of the gate. Give the session the owner tenant (what a wrong
    // membership row would produce) and the very same probe must return rows.
    // Without this, a probe that silently queried nothing would pass forever.
    const c = rawAppClient();
    await c.connect();
    try {
      await c.query(`SELECT set_config('app.current_user_id', $1, false)`, [
        DEMO_USER,
      ]);
      await c.query(`SELECT set_config('app.tenant_ids', $1, false)`, [
        `{${DEMO_TENANT},${OWNER_TENANT}}`,
      ]);
      const { rows } = await c.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM budgeting.categories WHERE tenant_id = $1`,
        [OWNER_TENANT],
      );
      expect(rows[0]!.n).toBeGreaterThan(0);
    } finally {
      await c.end();
    }
  });

  it("a demo session cannot WRITE into the owner's tenant either", async () => {
    const ids = await tenantIdsFor(DEMO_USER);
    const c = rawAppClient();
    await c.connect();
    try {
      await c.query(`SELECT set_config('app.current_user_id', $1, false)`, [
        DEMO_USER,
      ]);
      await c.query(`SELECT set_config('app.tenant_ids', $1, false)`, [
        `{${ids.join(",")}}`,
      ]);
      await expect(
        c.query(
          `INSERT INTO budgeting.categories (id, tenant_id, name, created_at, actor_user_id, sort_index)
           VALUES (gen_random_uuid(), $1, 'injected', now(), $2, 0)`,
          [OWNER_TENANT, DEMO_USER],
        ),
      ).rejects.toThrow(/row-level security/i);
    } finally {
      await c.end();
    }
  });
});
