/**
 * v11-shape.test.ts — Wave-0 RED tests for v1.1 schema shape.
 * Asserts the renamed tables, dropped columns, and new columns exist after
 * drizzle/0012_phase01_v11_rename.sql + post-migration.sql have been applied.
 *
 * These tests FAIL against the v1.0 DB and PASS once the v1.1 migration runs.
 * Per plan 01-01 TDD contract: write red first, run migration, verify green.
 */
import { describe, test, beforeAll, afterAll, expect } from "bun:test";
import { Client } from "pg";

let client: Client;

beforeAll(async () => {
  const rawUrl = process.env.DATABASE_URL_MIGRATOR ?? process.env.DATABASE_URL_APP;
  if (!rawUrl) throw new Error("DATABASE_URL_MIGRATOR or DATABASE_URL_APP required");
  const url = rawUrl.replace("@db:", "@localhost:");
  client = new Client({ connectionString: url });
  await client.connect();
});

afterAll(async () => {
  await client.end();
});

async function tableExists(schema: string, table: string): Promise<boolean> {
  const res = await client.query<{ exists: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM information_schema.tables
       WHERE table_schema = $1 AND table_name = $2
     ) AS exists`,
    [schema, table],
  );
  return res.rows[0].exists;
}

async function columnExists(schema: string, table: string, column: string): Promise<boolean> {
  const res = await client.query<{ exists: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema = $1 AND table_name = $2 AND column_name = $3
     ) AS exists`,
    [schema, table, column],
  );
  return res.rows[0].exists;
}

async function forceRlsEnabled(schema: string, table: string): Promise<boolean> {
  const res = await client.query<{ relforcerowsecurity: boolean }>(
    `SELECT c.relforcerowsecurity
     FROM pg_class c
     JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = $1 AND c.relname = $2`,
    [schema, table],
  );
  if (res.rows.length === 0) return false;
  return res.rows[0].relforcerowsecurity;
}

describe("v1.1 schema shape", () => {
  test("tenancy.budgets exists, tenancy.workspaces gone", async () => {
    expect(await tableExists("tenancy", "budgets")).toBe(true);
    expect(await tableExists("tenancy", "workspaces")).toBe(false);
  });

  test("budgeting.wallets exists with wallet_type column SPENDINGS|CUSHION|RESERVE", async () => {
    expect(await tableExists("budgeting", "wallets")).toBe(true);
    expect(await columnExists("budgeting", "wallets", "wallet_type")).toBe(true);
    // Verify the enum values exist
    const res = await client.query(
      `SELECT e.enumlabel
       FROM pg_type t
       JOIN pg_enum e ON e.enumtypid = t.oid
       JOIN pg_namespace n ON n.oid = t.typnamespace
       WHERE n.nspname = 'budgeting' AND t.typname = 'wallet_type'
       ORDER BY e.enumsortorder`,
    );
    const vals = res.rows.map((r) => r.enumlabel as string);
    expect(vals).toContain("SPENDINGS");
    expect(vals).toContain("CUSHION");
    expect(vals).toContain("RESERVE");
  });

  test("budgeting.accounts no longer exists", async () => {
    expect(await tableExists("budgeting", "accounts")).toBe(false);
  });

  test("expense_ledger.kind/account_id columns dropped (or never existed)", async () => {
    // MIG-03: kind and account_id should be dropped from expense_ledger
    expect(await columnExists("budgeting", "expense_ledger", "kind")).toBe(false);
    expect(await columnExists("budgeting", "expense_ledger", "account_id")).toBe(false);
  });

  test("categories.sort_index exists with NOT NULL default 0", async () => {
    expect(await columnExists("budgeting", "categories", "sort_index")).toBe(true);
    const res = await client.query<{ column_default: string; is_nullable: string }>(
      `SELECT column_default, is_nullable
       FROM information_schema.columns
       WHERE table_schema = 'budgeting' AND table_name = 'categories' AND column_name = 'sort_index'`,
    );
    expect(res.rows[0].is_nullable).toBe("NO");
    expect(res.rows[0].column_default).toContain("0");
  });

  test("categories.scope column dropped", async () => {
    expect(await columnExists("budgeting", "categories", "scope")).toBe(false);
  });

  test("budgets.cushion_mode_enabled exists with NOT NULL default false", async () => {
    expect(await columnExists("tenancy", "budgets", "cushion_mode_enabled")).toBe(true);
    const res = await client.query<{ column_default: string; is_nullable: string }>(
      `SELECT column_default, is_nullable
       FROM information_schema.columns
       WHERE table_schema = 'tenancy' AND table_name = 'budgets' AND column_name = 'cushion_mode_enabled'`,
    );
    expect(res.rows[0].is_nullable).toBe("NO");
    expect(res.rows[0].column_default).toBe("false");
  });

  test("category_limits.cushion_amount_cents column exists", async () => {
    expect(await columnExists("budgeting", "category_limits", "cushion_amount_cents")).toBe(true);
  });

  test("budgeting.tasks exists with relrowsecurity=true and relforcerowsecurity=true", async () => {
    expect(await tableExists("budgeting", "tasks")).toBe(true);
    const res = await client.query<{
      relrowsecurity: boolean;
      relforcerowsecurity: boolean;
    }>(
      `SELECT c.relrowsecurity, c.relforcerowsecurity
       FROM pg_class c
       JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'budgeting' AND c.relname = 'tasks'`,
    );
    expect(res.rows[0].relrowsecurity).toBe(true);
    expect(res.rows[0].relforcerowsecurity).toBe(true);
  });

  test("budget_mode_history.budget_id column exists, workspace_id gone", async () => {
    expect(await tableExists("budgeting", "budget_mode_history")).toBe(true);
    expect(await columnExists("budgeting", "budget_mode_history", "budget_id")).toBe(true);
    expect(await columnExists("budgeting", "budget_mode_history", "workspace_id")).toBe(false);
    // Old table should be gone too
    expect(await tableExists("budgeting", "workspace_budget_mode_history")).toBe(false);
  });

  test("identity.accounts (Better Auth provider table) still exists untouched", async () => {
    // MIG requirement: ONLY budgeting.accounts renamed; identity.accounts MUST survive
    expect(await tableExists("identity", "accounts")).toBe(true);
  });

  test("tenancy.budget_members and tenancy.budget_invitations exist", async () => {
    expect(await tableExists("tenancy", "budget_members")).toBe(true);
    expect(await tableExists("tenancy", "workspace_members")).toBe(false);
    expect(await tableExists("tenancy", "budget_invitations")).toBe(true);
    expect(await tableExists("tenancy", "workspace_invitations")).toBe(false);
  });

  test("budgeting.budget_mode_history and budgeting.budget_share_dirty exist", async () => {
    expect(await tableExists("budgeting", "budget_share_dirty")).toBe(true);
    expect(await tableExists("budgeting", "workspace_share_dirty")).toBe(false);
  });

  test("budgeting.tasks has tasks_budget_status_idx index", async () => {
    const res = await client.query<{ indexname: string }>(
      `SELECT indexname FROM pg_indexes
       WHERE schemaname = 'budgeting' AND tablename = 'tasks' AND indexname = 'tasks_budget_status_idx'`,
    );
    expect(res.rows.length).toBe(1);
  });
});
