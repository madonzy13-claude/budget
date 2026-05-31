// Phase 7 Wave 0 scaffold — concrete assertions land in Plan 0X. Stubs use pending-todo markers to keep `make test` green.
/**
 * resolve-idempotency.test.ts — TaskRepo.resolve / resolveByDraftId idempotency tests.
 *
 * Covers the Nyquist 4 cases per VALIDATION.md § "Resolve Idempotency":
 *   1. UPDATE matches no rows when task already RESOLVED
 *   2. UPDATE matches no rows when task does not exist
 *   3. UPDATE respects tenant scope (cross-tenant resolve fails)
 *   4. resolveConfirmDraftByDraftId scopes by payload_json->>'draft_id' AND tenant_id
 *
 * Bootstrapping mirrors tests/tenant-leak/tasks-cross-tenant.test.ts (lines 42–56).
 * Concrete assertions written in Plan 07-02.
 */
import { describe, it, expect, beforeAll } from "bun:test";
import { Pool } from "pg";

const DB_URL_RAW = process.env.DATABASE_URL_APP;
if (!DB_URL_RAW)
  throw new Error("DATABASE_URL_APP required for resolve idempotency tests");
process.env.DATABASE_URL_APP = DB_URL_RAW.replace("@db:", "@localhost:");
const DB_URL = process.env.DATABASE_URL_APP;

const { resetPools, withTenantTx } = await import("@budget/platform");
const { TenantId, UserId } = await import("@budget/shared-kernel");
resetPools();

// Suppress unused-import lint until Plan 07-02 lands the real assertions.
void Pool;
void withTenantTx;
void TenantId;
void UserId;
void DB_URL;

describe("Resolve idempotency", () => {
  beforeAll(() => {
    // Seed harness wires up in Plan 07-02.
  });

  it.todo("resolve UPDATE matches no rows when task already RESOLVED (no-op)");
  it.todo("resolve UPDATE matches no rows when task does not exist (no-op)");
  it.todo("resolve UPDATE respects tenant scope (cross-tenant resolve fails)");
  it.todo("resolveConfirmDraftByDraftId scopes by payload_json->>'draft_id' AND tenant_id");
});
