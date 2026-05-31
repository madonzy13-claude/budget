// Phase 7 Wave 0 scaffold — concrete assertions land in Plan 0X. Stubs use pending-todo markers to keep `make test` green.
/**
 * cushion-summary-cross-tenant.test.ts — Tenant-leak gate test for
 * `GET /budgets/:id/cushion-summary` (Phase 7).
 *
 * Multi-layered protection mirrored from tasks-cross-tenant.test.ts:
 *
 * Layer 1 — Route handler:
 *   The route reads c.get("tenantIds") and returns 404 when the requested
 *   budgetId is NOT in that verified set. Tested at the HTTP boundary in
 *   apps/api/test/routes/cushion-summary.test.ts after Plan 07-07.
 *
 * Layer 2 — RLS / adapter (this file):
 *   getCushionSummary opens withTenantTx with a SINGLE tenant id. SELECTing
 *   budgetA's category_limits / wallets while tenantId=B is in the GUC must
 *   return 0 rows — the cushion summary then degenerates to a zero-shortfall
 *   payload, never leaking budgetA's amounts.
 *
 * Gate accounting (`make ci-gate` → tests/tenant-leak/*.test.ts):
 *   - force-rls-on-all-tables
 *   - in-process-bus-tenant-scope
 *   - job-without-tenant-errors
 *   - no-guc-zero-rows
 *   - pg-roles-no-bypassrls
 *   - home-summary-cross-tenant
 *   - tasks-cross-tenant
 *   - cushion-summary-cross-tenant (NEW — this file, Phase 7)
 * Total: 7 → 8 files.
 *
 * Concrete assertions land in Plan 07-03 / 07-07 (after the application service
 * `getCushionSummary` ships).
 */
import { describe, it, expect, beforeAll } from "bun:test";
import { Pool } from "pg";

const DB_URL_RAW = process.env.DATABASE_URL_APP;
if (!DB_URL_RAW)
  throw new Error("DATABASE_URL_APP required for tenant-leak gate tests");
process.env.DATABASE_URL_APP = DB_URL_RAW.replace("@db:", "@localhost:");
const DB_URL = process.env.DATABASE_URL_APP;

const { resetPools, withTenantTx } = await import("@budget/platform");
const { TenantId, UserId } = await import("@budget/shared-kernel");
resetPools();

// Suppress unused-import lint until Plan 07-03 / 07-07 land the real assertions.
void Pool;
void withTenantTx;
void TenantId;
void UserId;
void DB_URL;

describe("GET /budgets/:id/cushion-summary tenant isolation", () => {
  beforeAll(() => {
    // Seed budgets A and B in Plan 07-03 / 07-07.
  });

  it.todo("Layer 1 (route): user without budgetA in tenantIds gets 404");
  it.todo("Layer 2 (RLS): direct getCushionSummary call with budgetB scope returns no budgetA data");
  it.todo("Layer 2 sanity: same call with budgetA scope returns budgetA data");
});
