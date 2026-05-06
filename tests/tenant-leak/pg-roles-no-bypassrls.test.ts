/**
 * Test 3 (T-3): pg_roles confirms app_role, worker_role, migrator are NOBYPASSRLS.
 *
 * Connects as migrator and queries pg_roles.
 * Fails if any of the three roles has rolbypassrls=true.
 * Fails if any of the three roles is missing entirely (indicates misconfigured DB).
 *
 * Negative smoke: to verify this test is real, temporarily SET app_role BYPASSRLS
 * in post-migration.sql and rerun — this test MUST fail.
 */
import { describe, it, expect, beforeAll } from "bun:test";
import { startTestcontainer } from "@budget/db/test/testcontainer";
import { rawMigratorClient } from "./fixtures/raw-pg-client";

const CHECKED_ROLES = ["app_role", "worker_role", "migrator"] as const;

beforeAll(async () => {
  await startTestcontainer();
}, 60_000);

describe("Test 3: pg_roles NOBYPASSRLS", () => {
  it("all three roles exist and none have rolbypassrls=true", async () => {
    const client = rawMigratorClient();
    await client.connect();

    try {
      const r = await client.query<{ rolname: string; rolbypassrls: boolean }>(
        `SELECT rolname, rolbypassrls
           FROM pg_roles
          WHERE rolname = ANY($1::name[])
          ORDER BY rolname`,
        [CHECKED_ROLES],
      );

      // Assert all three roles exist
      const foundRoles = r.rows.map((row) => row.rolname).sort();
      const expectedRoles = [...CHECKED_ROLES].sort();
      expect(foundRoles).toEqual(expectedRoles);
      expect(r.rows).toHaveLength(3);

      // Assert none have BYPASSRLS
      for (const row of r.rows) {
        if (row.rolbypassrls) {
          throw new Error(
            `SECURITY VIOLATION: role '${row.rolname}' has rolbypassrls=true — ` +
              `this role can read ALL tenant data regardless of RLS policies. ` +
              `Set NOBYPASSRLS in post-migration.sql to fix.`,
          );
        }
        expect(row.rolbypassrls).toBe(false);
      }
    } finally {
      await client.end();
    }
  }, 5_000);

  it("app_role specifically is NOBYPASSRLS", async () => {
    const client = rawMigratorClient();
    await client.connect();
    try {
      const r = await client.query<{ rolbypassrls: boolean }>(
        `SELECT rolbypassrls FROM pg_roles WHERE rolname = 'app_role'`,
      );
      expect(r.rows[0]?.rolbypassrls).toBe(false);
    } finally {
      await client.end();
    }
  }, 5_000);

  it("worker_role specifically is NOBYPASSRLS", async () => {
    const client = rawMigratorClient();
    await client.connect();
    try {
      const r = await client.query<{ rolbypassrls: boolean }>(
        `SELECT rolbypassrls FROM pg_roles WHERE rolname = 'worker_role'`,
      );
      expect(r.rows[0]?.rolbypassrls).toBe(false);
    } finally {
      await client.end();
    }
  }, 5_000);
});
