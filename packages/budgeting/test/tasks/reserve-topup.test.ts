// Phase 7 Wave 0 scaffold — concrete assertions land in Plan 0X. Stubs use pending-todo markers to keep `make test` green.
/**
 * reserve-topup.test.ts — RESERVE_TOPUP generator test scaffold.
 *
 * Covers the Nyquist 6 cases per VALIDATION.md § "Minimum Test Cases per Kind":
 *   1. emits when mismatch > 0 after wallet balance change
 *   2. does not emit when mismatch = 0
 *   3. dedup via partial unique index (tasks_reserve_topup_pending_uq)
 *   4. resolves when mismatch corrected
 *   5. hourly sweep emits when inline path was missed (FX drift)
 *   6. direction field: TOPUP vs WITHDRAW
 *
 * Bootstrapping mirrors tests/tenant-leak/tasks-cross-tenant.test.ts (lines 42–56).
 * Concrete assertions written in Plan 07-05 / 07-06.
 */
import { describe, it, expect, beforeAll } from "bun:test";
import { Pool } from "pg";

const DB_URL_RAW = process.env.DATABASE_URL_APP;
if (!DB_URL_RAW)
  throw new Error("DATABASE_URL_APP required for reserve-topup generator tests");
process.env.DATABASE_URL_APP = DB_URL_RAW.replace("@db:", "@localhost:");
const DB_URL = process.env.DATABASE_URL_APP;

const { resetPools, withTenantTx } = await import("@budget/platform");
const { TenantId, UserId } = await import("@budget/shared-kernel");
resetPools();

// Suppress unused-import lint until Plan 07-05 lands the real assertions.
void Pool;
void withTenantTx;
void TenantId;
void UserId;
void DB_URL;

describe("RESERVE_TOPUP generator", () => {
  beforeAll(() => {
    // Seed harness wires up in Plan 07-05.
  });

  it.todo("emits when mismatch > 0 after wallet balance change", () => {});
  it.todo("does not emit when mismatch = 0", () => {});
  it.todo("dedup: second mismatch does not create second task (ON CONFLICT DO NOTHING)", () => {});
  it.todo("resolves when mismatch corrected by reserve adjustment", () => {});
  it.todo("hourly sweep emits when inline path was missed (FX drift simulation)", () => {});
  it.todo("direction field: TOPUP when wallets < reserves; WITHDRAW when wallets > reserves", () => {});
});
