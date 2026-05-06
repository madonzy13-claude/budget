import { test, expect, beforeAll } from "bun:test";
import { startTestcontainer } from "@budget/db/test/testcontainer";
import { Pool } from "pg";

beforeAll(async () => {
  await startTestcontainer();
});

test("migrator role identity", async () => {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL_MIGRATOR,
  });
  const r = await pool.query("SELECT current_user AS who");
  expect(r.rows[0]?.who).toBe("migrator");
  await pool.end();
});

test("migrator role does not bypass RLS", async () => {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL_MIGRATOR,
  });
  const r = await pool.query(
    `SELECT rolbypassrls FROM pg_roles WHERE rolname = 'migrator'`,
  );
  expect(r.rows[0]?.rolbypassrls).toBe(false);
  await pool.end();
});
