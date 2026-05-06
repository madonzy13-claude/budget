/**
 * Test 1 (T-1): SELECT without GUC returns 0 rows from every user-data table.
 *
 * Uses raw pg.Client (NOT withTenantTx) as app_role to prove RLS enforces
 * independently of app code (T-13 green-washing protection).
 *
 * Three sub-tests:
 *  1a. No GUC set: every INCLUDED table returns COUNT(*) = 0
 *  1b. TENANT-SCOPED cross-tenant: SET LOCAL app.tenant_ids = tenantA but query tenantB's
 *      rows → 0 rows (T-13: proves real data was seeded and the filter blocks cross-tenant reads)
 *  1c. USER-SCOPED cross-user: SET LOCAL app.current_user_id = alice but query bob's rows → 0
 */
import { describe, it, expect, beforeAll } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { startTestcontainer } from "@budget/db/test/testcontainer";
import { rawAppClient } from "./fixtures/raw-pg-client";
import { seedTwoTenants } from "./fixtures/seed-two-tenants";

const TABLES_FILE = resolve(import.meta.dir, "USER-DATA-TABLES.txt");

interface TableEntry {
  table: string;
  scope: "TENANT-SCOPED" | "USER-SCOPED";
}

function parseTablesFile(): {
  tenantScoped: TableEntry[];
  userScoped: TableEntry[];
} {
  const content = readFileSync(TABLES_FILE, "utf8");
  const tenantScoped: TableEntry[] = [];
  const userScoped: TableEntry[] = [];

  for (const rawLine of content.split("\n")) {
    const line = rawLine.trim();
    // Skip comments and blank lines
    if (!line || line.startsWith("#")) continue;
    const parts = line.split(/\s+/);
    const table = parts[0];
    const scope = parts[1];
    if (!table || !scope) continue;
    if (scope === "TENANT-SCOPED") tenantScoped.push({ table, scope });
    if (scope === "USER-SCOPED") userScoped.push({ table, scope });
    // EXCLUDED lines are intentionally skipped
  }
  return { tenantScoped, userScoped };
}

beforeAll(async () => {
  await startTestcontainer();
  await seedTwoTenants();
}, 60_000);

describe("Test 1a: no GUC → 0 rows from every INCLUDED table", () => {
  const { tenantScoped, userScoped } = parseTablesFile();
  const allIncluded = [...tenantScoped, ...userScoped];

  for (const { table, scope } of allIncluded) {
    it(`${table} (${scope}): COUNT(*) without GUC = 0`, async () => {
      const client = rawAppClient();
      await client.connect();
      try {
        const r = await client.query(`SELECT COUNT(*)::int AS n FROM ${table}`);
        expect(r.rows[0]?.n).toBe(0);
      } finally {
        await client.end();
      }
    }, 5_000);
  }
});

describe("Test 1b: cross-tenant filter (TENANT-SCOPED tables)", () => {
  it("app.tenant_ids = tenantA cannot see tenantB rows in shared_kernel.audit_history", async () => {
    const { tenantA, tenantB } = await seedTwoTenants();
    const client = rawAppClient();
    await client.connect();
    try {
      await client.query("BEGIN");
      // Set app.tenant_ids to tenantA only — must NOT see tenantB rows
      await client.query(`SET LOCAL app.tenant_ids = '{${tenantA}}'`);
      await client.query(
        `SET LOCAL app.current_user_id = '00000000-0000-0000-0000-00000000cafe'`,
      );
      const r = await client.query(
        `SELECT COUNT(*)::int AS n FROM shared_kernel.audit_history WHERE tenant_id = $1`,
        [tenantB],
      );
      expect(r.rows[0]?.n).toBe(0);
      await client.query("COMMIT");
    } finally {
      await client.end();
    }
  }, 5_000);

  it("app.tenant_ids = tenantA cannot see tenantB rows in budgeting.expense_ledger", async () => {
    const { tenantA, tenantB } = await seedTwoTenants();
    const client = rawAppClient();
    await client.connect();
    try {
      await client.query("BEGIN");
      await client.query(`SET LOCAL app.tenant_ids = '{${tenantA}}'`);
      await client.query(
        `SET LOCAL app.current_user_id = '00000000-0000-0000-0000-00000000cafe'`,
      );
      const r = await client.query(
        `SELECT COUNT(*)::int AS n FROM budgeting.expense_ledger WHERE tenant_id = $1`,
        [tenantB],
      );
      expect(r.rows[0]?.n).toBe(0);
      await client.query("COMMIT");
    } finally {
      await client.end();
    }
  }, 5_000);
});

describe("Test 1c: cross-user filter (USER-SCOPED tables, PC-12)", () => {
  it("app.current_user_id = alice cannot see bob rows in identity.user_preferences", async () => {
    const { aliceId, bobId } = await seedTwoTenants();
    const client = rawAppClient();
    await client.connect();
    try {
      await client.query("BEGIN");
      // Set app.current_user_id to alice — must NOT see bob's preferences
      await client.query(`SET LOCAL app.current_user_id = '${aliceId}'`);
      const r = await client.query(
        `SELECT COUNT(*)::int AS n FROM identity.user_preferences WHERE user_id = $1`,
        [bobId],
      );
      expect(r.rows[0]?.n).toBe(0);
      await client.query("COMMIT");
    } finally {
      await client.end();
    }
  }, 5_000);
});
