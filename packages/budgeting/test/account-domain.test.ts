/**
 * account-domain.test.ts — Updated to use Wallet (Plan 01-02 rename).
 * Account is now an alias for Wallet; tests updated to v1.1 constructor.
 * Primary tests live in test/domain/wallet.test.ts.
 */
import { describe, test, expect } from "bun:test";
import { Wallet } from "../src/domain/wallet";
import { Money } from "@budget/shared-kernel";

function makeWallet(
  overrides: Partial<{
    id: string;
    tenantId: string;
    name: string;
    walletType: "SPENDINGS" | "CUSHION" | "RESERVE";
    currency: string;
    currentBalance: ReturnType<typeof Money.of>;
    archivedAt: Date | null;
    createdAt: Date;
    actorUserId: string;
  }> = {},
): Wallet {
  const defaults = {
    id: "acc-001",
    tenantId: "tenant-001",
    name: "My Account",
    walletType: "SPENDINGS" as const,
    currency: "EUR",
    currentBalance: Money.of("0", "EUR" as any),
    archivedAt: null,
    createdAt: new Date("2026-01-01"),
    actorUserId: "user-001",
  };
  const merged = { ...defaults, ...overrides };
  return new Wallet(
    merged.id,
    merged.tenantId,
    merged.name,
    merged.walletType,
    merged.currency,
    merged.currentBalance,
    merged.archivedAt,
    merged.createdAt,
    merged.actorUserId,
  );
}

describe("Wallet domain (via account-domain compat test)", () => {
  describe("canChangeCurrency()", () => {
    // D-PH5-W12 (Phase 5): WALT-04 rescinded at the domain layer. The
    // reserve-currency invariant moved to the use-case layer (update-wallet.ts)
    // so it can call budgetCurrencyOf(tenantId) without domain ↔ tenancy
    // coupling. Domain now returns ok(undefined) unconditionally; route-level
    // and E2E tests (reserve-currency-rejected.feature) enforce the invariant.
    test("returns ok unconditionally — invariant moved to use-case layer (D-PH5-W12)", () => {
      const wal = makeWallet();
      const result = wal.canChangeCurrency();
      expect(result.isOk()).toBe(true);
    });
  });

  describe("archive()", () => {
    test("sets archivedAt on first call", () => {
      const wal = makeWallet({ archivedAt: null });
      const result = wal.archive();
      expect(result.isOk()).toBe(true);
      expect(wal.archivedAt).toBeInstanceOf(Date);
    });

    test("returns err on double-archive", () => {
      const wal = makeWallet({ archivedAt: new Date() });
      const result = wal.archive();
      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().message).toMatch(/already archived/i);
    });
  });

  describe("applyAdjustment()", () => {
    test("returns err when delta currency != wallet currency", () => {
      const wal = makeWallet({
        currency: "EUR",
        currentBalance: Money.of("100", "EUR" as any),
      });
      const deltaPLN = Money.of("50", "PLN" as any);
      const result = wal.applyAdjustment(deltaPLN);
      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().message).toMatch(/PLN.*EUR|currency/i);
    });

    test("updates currentBalance when delta currency matches wallet currency", () => {
      const wal = makeWallet({
        currency: "EUR",
        currentBalance: Money.of("100", "EUR" as any),
      });
      const deltaEUR = Money.of("25", "EUR" as any);
      const result = wal.applyAdjustment(deltaEUR);
      expect(result.isOk()).toBe(true);
      expect(wal.currentBalance.amount.toFixed(2)).toBe("125.00");
    });
  });

  describe("isArchived()", () => {
    test("returns false when archivedAt is null", () => {
      const wal = makeWallet({ archivedAt: null });
      expect(wal.isArchived()).toBe(false);
    });

    test("returns true when archivedAt is set", () => {
      const wal = makeWallet({ archivedAt: new Date() });
      expect(wal.isArchived()).toBe(true);
    });
  });
});
