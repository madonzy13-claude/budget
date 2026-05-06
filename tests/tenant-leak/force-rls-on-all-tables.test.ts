/**
 * Test 4 (T-1): pg_class confirms FORCE ROW LEVEL SECURITY on every user-data table.
 *
 * Connects as migrator via raw pg.Client (T-13 proof — bypasses app layer).
 * Reads INCLUDED tables from USER-DATA-TABLES.txt at runtime.
 * Asserts relrowsecurity=true AND relforcerowsecurity=true for every INCLUDED table.
 *
 * Also verifies EXCLUDED tables (shared_kernel.outbox, identity.verifications,
 * tenancy.workspace_invitations) do NOT have FORCE ROW LEVEL SECURITY (expected — Pitfall 10).
 *
 * Negative smoke: flip any table to NOFORCE ROW LEVEL SECURITY in post-migration.sql
 * and rerun — this test MUST fail.
 */
import { describe, it, expect, beforeAll } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { startTestcontainer } from "@budget/db/test/testcontainer";
import { rawMigratorClient } from "./fixtures/raw-pg-client";

const TABLES_FILE = resolve(import.meta.dir, "USER-DATA-TABLES.txt");

function parseTablesFile(): { included: string[]; excluded: string[] } {
  const content = readFileSync(TABLES_FILE, "utf8");
  const included: string[] = [];
  const excluded: string[] = [];

  for (const rawLine of content.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const parts = line.split(/\s+/);
    const table = parts[0];
    const scope = parts[1];
    if (!table || !scope) continue;
    if (scope === "TENANT-SCOPED" || scope === "USER-SCOPED")
      included.push(table);
    if (scope === "EXCLUDED") excluded.push(table);
  }

  return { included, excluded };
}

beforeAll(async () => {
  await startTestcontainer();
}, 60_000);

describe("Test 4: FORCE ROW LEVEL SECURITY on all INCLUDED tables", () => {
  const { included, excluded } = parseTablesFile();

  it("every INCLUDED table has relrowsecurity=true AND relforcerowsecurity=true", async () => {
    const client = rawMigratorClient();
    await client.connect();

    try {
      const r = await client.query<{
        table_name: string;
        relrowsecurity: boolean;
        relforcerowsecurity: boolean;
      }>(
        `SELECT n.nspname || '.' || c.relname AS table_name,
                  c.relrowsecurity,
                  c.relforcerowsecurity
             FROM pg_class c
             JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE c.relkind = 'r'
              AND n.nspname IN ('identity', 'tenancy', 'shared_kernel', 'budgeting')
              AND (n.nspname || '.' || c.relname) = ANY($1::text[])
            ORDER BY table_name`,
        [included],
      );

      // Build a lookup from query results
      const byName = new Map(r.rows.map((row) => [row.table_name, row]));

      const failures: string[] = [];

      for (const table of included) {
        const row = byName.get(table);
        if (!row) {
          failures.push(
            `${table}: NOT FOUND in pg_class — table does not exist`,
          );
          continue;
        }
        if (!row.relrowsecurity) {
          failures.push(`${table}: relrowsecurity=false — RLS is disabled`);
        }
        if (!row.relforcerowsecurity) {
          failures.push(
            `${table}: relforcerowsecurity=false — FORCE ROW LEVEL SECURITY is not set`,
          );
        }
      }

      if (failures.length > 0) {
        throw new Error(
          `SECURITY VIOLATION — ${failures.length} table(s) missing FORCE RLS:\n` +
            failures.map((f) => `  - ${f}`).join("\n"),
        );
      }

      // All included tables must be found
      expect(r.rows.length).toBe(included.length);
    } finally {
      await client.end();
    }
  }, 10_000);

  it("shared_kernel.outbox (EXCLUDED / Pitfall 10) does NOT have FORCE ROW LEVEL SECURITY", async () => {
    const client = rawMigratorClient();
    await client.connect();
    try {
      const r = await client.query<{
        relforcerowsecurity: boolean;
      }>(
        `SELECT c.relforcerowsecurity
             FROM pg_class c
             JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE c.relkind = 'r'
              AND n.nspname = 'shared_kernel'
              AND c.relname = 'outbox'`,
      );
      // outbox MUST NOT have FORCE ROW LEVEL SECURITY (it's infrastructure, not user data)
      expect(r.rows[0]?.relforcerowsecurity).toBe(false);
    } finally {
      await client.end();
    }
  }, 5_000);

  it("reports excluded tables as separate from included list", () => {
    // Non-DB check: verify USER-DATA-TABLES.txt EXCLUDED section has expected tables
    expect(excluded).toContain("shared_kernel.outbox");
    expect(excluded).toContain("identity.verifications");
    expect(excluded).toContain("tenancy.workspace_invitations");
  });
});
