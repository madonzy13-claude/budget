/**
 * v11-shape.test.ts — Static parse (Option B) gate for v1.1 schema shape.
 *
 * Implementation choice: static parse, NOT migrate() + live DB.
 *
 * Rationale: migration 0013's CREATE VIEW (Section E) references columns
 * (amount_converted_cents, kind, confirmed_at, budget_id) that do not exist
 * until the same migration's earlier sections complete. When Postgres replays
 * from scratch in a single session the view DDL succeeds because all statements
 * run in order. However the reserve_accum CTE has a self-referential subquery
 * bug (fixed in 0014), so any test that actually QUERIES the view fails.
 * Running migrate() also requires a live DB, Infisical secrets, and Docker —
 * making the gate environment-dependent and slow.
 *
 * Static parse asserts the same invariants by reading migration SQL + Drizzle
 * schema TS files as text and applying regex/substring checks. Fast, hermetic,
 * no DB required.
 *
 * Invariants checked:
 *   - Dropped: account_balance_adjustments, corrects_id, transfer_group_id,
 *              kind (recurring_rules), wallet_id (recurring_rules + expense_ledger)
 *   - Added:   amount_original_cents, amount_converted_cents, fx_as_of,
 *              yearly_month (recurring_rules)
 *   - Created: tenancy.budget_share_links, budgeting.category_reserve_balance VIEW
 *   - Constraints: cadence CHECK includes DAILY|WEEKLY|MONTHLY|YEARLY
 *   - Drizzle TS mirrors declare the same columns as the SQL migrations
 */

import { describe, test, expect, beforeAll } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";

// ---------------------------------------------------------------------------
// File loading
// ---------------------------------------------------------------------------

const ROOT = join(import.meta.dir, "../../../..");

function readMigration(name: string): string {
  return readFileSync(join(ROOT, "drizzle", name), "utf8");
}

function readSchema(pkg: string, file: string): string {
  return readFileSync(
    join(ROOT, "packages", pkg, "src/adapters/persistence", file),
    "utf8",
  );
}

let sql0013: string;
let sql0014: string;
let sql0015: string;
let postMig: string;
let mergedSql: string;

let expenseLedgerSchema: string;
let recurringRulesSchema: string;
let shareLinksSchema: string;

beforeAll(() => {
  sql0013 = readMigration("0013_phase02_domain_restructure.sql");
  sql0014 = readMigration("0014_fix_reserve_view.sql");
  sql0015 = readMigration("0015_phase02_04_share_link_public_resolve.sql");
  postMig = readFileSync(
    join(ROOT, "apps/migrator/post-migration.sql"),
    "utf8",
  );
  mergedSql = [sql0013, sql0014, sql0015, postMig].join("\n");

  recurringRulesSchema = readSchema("budgeting", "recurring-rules-schema.ts");
  shareLinksSchema = readSchema("tenancy", "budget-share-links-schema.ts");
  expenseLedgerSchema = readFileSync(
    join(
      ROOT,
      "packages/budgeting/src/adapters/persistence/transaction-repo.ts",
    ),
    "utf8",
  );
});

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function containsPattern(text: string, pattern: RegExp | string): boolean {
  if (pattern instanceof RegExp) return pattern.test(text);
  return text.includes(pattern);
}

// ---------------------------------------------------------------------------
// 1. Dropped tables / columns in SQL migrations
// ---------------------------------------------------------------------------

describe("v1.1 SQL migrations — drops", () => {
  test("account_balance_adjustments is dropped", () => {
    expect(
      containsPattern(
        sql0013,
        /DROP TABLE\s+IF EXISTS\s+budgeting\.account_balance_adjustments/i,
      ),
    ).toBe(true);
  });

  test("expense_ledger.corrects_id is dropped", () => {
    expect(
      containsPattern(
        sql0013,
        /ALTER TABLE budgeting\.expense_ledger DROP COLUMN IF EXISTS corrects_id/i,
      ),
    ).toBe(true);
  });

  test("expense_ledger.transfer_group_id is dropped", () => {
    expect(
      containsPattern(
        sql0013,
        /ALTER TABLE budgeting\.expense_ledger DROP COLUMN IF EXISTS transfer_group_id/i,
      ),
    ).toBe(true);
  });

  test("recurring_rules.wallet_id is dropped", () => {
    expect(
      containsPattern(
        sql0013,
        /ALTER TABLE budgeting\.recurring_rules DROP COLUMN IF EXISTS wallet_id/i,
      ),
    ).toBe(true);
  });

  test("recurring_rules.kind is dropped", () => {
    expect(
      containsPattern(
        sql0013,
        /ALTER TABLE budgeting\.recurring_rules DROP COLUMN IF EXISTS kind/i,
      ),
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 2. Added columns in SQL migrations
// ---------------------------------------------------------------------------

describe("v1.1 SQL migrations — column additions", () => {
  test("expense_ledger gains amount_original_cents", () => {
    expect(
      containsPattern(
        sql0013,
        /ADD COLUMN\s+(?:IF NOT EXISTS\s+)?amount_original_cents\s+bigint/i,
      ),
    ).toBe(true);
  });

  test("expense_ledger gains amount_converted_cents", () => {
    expect(
      containsPattern(
        sql0013,
        /ADD COLUMN\s+(?:IF NOT EXISTS\s+)?amount_converted_cents\s+bigint/i,
      ),
    ).toBe(true);
  });

  test("expense_ledger fx column renamed to fx_as_of (via RENAME COLUMN fx_rate_date → fx_as_of)", () => {
    expect(
      containsPattern(sql0013, /RENAME COLUMN\s+fx_rate_date\s+TO\s+fx_as_of/i),
    ).toBe(true);
  });

  test("recurring_rules gains yearly_month column", () => {
    expect(
      containsPattern(
        sql0013,
        /ALTER TABLE budgeting\.recurring_rules\s+ADD COLUMN IF NOT EXISTS yearly_month\s+integer/i,
      ),
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 3. Created objects in SQL migrations
// ---------------------------------------------------------------------------

describe("v1.1 SQL migrations — created objects", () => {
  test("tenancy.budget_share_links table is created", () => {
    expect(
      containsPattern(
        sql0013,
        /CREATE TABLE\s+IF NOT EXISTS\s+tenancy\.budget_share_links/i,
      ),
    ).toBe(true);
  });

  test("budget_share_links has required columns: token, budget_id, expires_at", () => {
    const idx = sql0013.search(
      /CREATE TABLE\s+IF NOT EXISTS\s+tenancy\.budget_share_links/i,
    );
    expect(idx).toBeGreaterThan(-1);
    const block = sql0013.slice(idx, idx + 1500);
    expect(block).toContain("token");
    expect(block).toContain("budget_id");
    expect(block).toContain("expires_at");
  });

  test("budgeting.category_reserve_balance VIEW is created (0013 or 0014)", () => {
    const hasView =
      /CREATE(?:\s+OR\s+REPLACE)?\s+VIEW\s+budgeting\.category_reserve_balance/i.test(
        mergedSql,
      );
    expect(hasView).toBe(true);
  });

  test("0014 fixes the VIEW — DROP + fresh CREATE guarantees clean DDL", () => {
    expect(
      containsPattern(
        sql0014,
        /DROP VIEW IF EXISTS budgeting\.category_reserve_balance/i,
      ),
    ).toBe(true);
    expect(
      containsPattern(
        sql0014,
        /CREATE VIEW budgeting\.category_reserve_balance/i,
      ),
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 4. Constraints
// ---------------------------------------------------------------------------

describe("v1.1 SQL migrations — constraints", () => {
  test("recurring_rules cadence CHECK includes all four values DAILY|WEEKLY|MONTHLY|YEARLY", () => {
    expect(
      containsPattern(
        sql0013,
        /cadence\s+IN\s*\(\s*['"]?DAILY['"]?\s*,\s*['"]?WEEKLY['"]?\s*,\s*['"]?MONTHLY['"]?\s*,\s*['"]?YEARLY['"]?\s*\)/i,
      ),
    ).toBe(true);
  });

  test("expense_ledger kind CHECK limits to SPENDING|INCOME", () => {
    // The constraint is inside a PL/pgSQL EXECUTE string with doubled single-quotes:
    // CHECK (kind IN (''SPENDING'',''INCOME''))
    expect(
      containsPattern(
        sql0013,
        /CHECK\s*\(\s*kind\s+IN\s*\(\s*'+'?SPENDING'+'?\s*,\s*'+'?INCOME'+'?\s*\)\s*\)/i,
      ) ||
        containsPattern(sql0013, "CHECK (kind IN (''SPENDING'',''INCOME''))"),
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 5. Drizzle TS schema mirrors
// ---------------------------------------------------------------------------

describe("v1.1 Drizzle TS schema mirrors", () => {
  test("recurring-rules-schema.ts declares yearlyMonth / yearly_month column", () => {
    expect(
      containsPattern(
        recurringRulesSchema,
        /yearlyMonth\s*:\s*integer\s*\(\s*["']yearly_month["']\s*\)/,
      ),
    ).toBe(true);
  });

  test("recurring-rules-schema.ts cadence CHECK includes all four values", () => {
    expect(
      containsPattern(recurringRulesSchema, /DAILY.*WEEKLY.*MONTHLY.*YEARLY/s),
    ).toBe(true);
  });

  test("recurring-rules-schema.ts does NOT declare walletId / wallet_id as a column", () => {
    // Column declaration looks like: walletId: uuid("wallet_id")
    // The comment "walletId (wallet_id) DROPPED" is allowed — only flag actual column decls
    expect(
      containsPattern(
        recurringRulesSchema,
        /walletId\s*:\s*\w+\s*\(["']wallet_id["']\)/,
      ),
    ).toBe(false);
  });

  test("recurring-rules-schema.ts does NOT declare kind column", () => {
    // Look for `kind:` field declaration pattern (not comments)
    expect(containsPattern(recurringRulesSchema, /^\s+kind\s*:/m)).toBe(false);
  });

  test("budget-share-links-schema.ts declares token column", () => {
    expect(
      containsPattern(
        shareLinksSchema,
        /token\s*:\s*text\s*\(\s*["']token["']\s*\)/,
      ),
    ).toBe(true);
  });

  test("budget-share-links-schema.ts declares budgetId / budget_id column", () => {
    expect(
      containsPattern(
        shareLinksSchema,
        /budgetId\s*:\s*uuid\s*\(\s*["']budget_id["']\s*\)/,
      ),
    ).toBe(true);
  });

  test("budget-share-links-schema.ts declares expiresAt / expires_at column", () => {
    expect(containsPattern(shareLinksSchema, /expiresAt\s*:\s*timestamp/)).toBe(
      true,
    );
  });

  test("transaction-repo.ts references amount_original_cents and amount_converted_cents", () => {
    expect(expenseLedgerSchema).toContain("amount_original_cents");
    expect(expenseLedgerSchema).toContain("amount_converted_cents");
  });

  test("transaction-repo.ts references fx_as_of (not fx_rate_date)", () => {
    expect(expenseLedgerSchema).toContain("fx_as_of");
    expect(expenseLedgerSchema).not.toContain("fx_rate_date");
  });
});

// ---------------------------------------------------------------------------
// 6. 0015 RLS policy for public token resolve
// ---------------------------------------------------------------------------

describe("0015 worker_role public resolve policy", () => {
  test("creates budget_share_links_worker_public_resolve policy", () => {
    expect(
      containsPattern(
        sql0015,
        /CREATE POLICY\s+budget_share_links_worker_public_resolve/i,
      ),
    ).toBe(true);
  });

  test("policy is FOR SELECT TO worker_role", () => {
    expect(containsPattern(sql0015, /FOR SELECT/i)).toBe(true);
    expect(containsPattern(sql0015, /TO\s+worker_role/i)).toBe(true);
  });
});
