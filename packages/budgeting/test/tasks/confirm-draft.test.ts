// Phase 7 Wave 0 scaffold — concrete assertions land in Plan 0X. Stubs use pending-todo markers to keep `make test` green.
/**
 * confirm-draft.test.ts — CONFIRM_DRAFT generator test scaffold.
 *
 * Covers the Nyquist 6 cases per VALIDATION.md § "Minimum Test Cases per Kind":
 *   1. emits on fresh draft INSERT (recurring-engine handler)
 *   2. does not emit on conflict (already existed for that rule+date)
 *   3. resolves on confirmRecurringDraft
 *   4. resolves on dismissDraft
 *   5. resolves on skipRecurringDraft
 *   6. dedup: two rapid confirms do not throw (idempotent resolve)
 *
 * Bootstrapping mirrors tests/tenant-leak/tasks-cross-tenant.test.ts (lines 42–56).
 * Concrete assertions written in Plan 07-04.
 */
import { describe, it, expect, beforeAll } from "bun:test";
import { Pool } from "pg";

const DB_URL_RAW = process.env.DATABASE_URL_APP;
if (!DB_URL_RAW)
  throw new Error("DATABASE_URL_APP required for confirm-draft generator tests");
process.env.DATABASE_URL_APP = DB_URL_RAW.replace("@db:", "@localhost:");
const DB_URL = process.env.DATABASE_URL_APP;

const { resetPools, withTenantTx } = await import("@budget/platform");
const { TenantId, UserId } = await import("@budget/shared-kernel");
resetPools();

// Suppress unused-import lint until Plan 07-04 lands the real assertions.
void Pool;
void withTenantTx;
void TenantId;
void UserId;
void DB_URL;

describe("CONFIRM_DRAFT generator", () => {
  beforeAll(() => {
    // Seed harness wires up in Plan 07-04.
  });

  it.todo("emits on fresh draft INSERT (recurring-engine handler)", () => {});
  it.todo("does not emit on conflict (draft already existed for that rule+date)", () => {});
  it.todo("resolves on confirmRecurringDraft", () => {});
  it.todo("resolves on dismissDraft", () => {});
  it.todo("resolves on skipRecurringDraft", () => {});
  it.todo("dedup: two rapid confirms do not throw (idempotent resolve)", () => {});
});
