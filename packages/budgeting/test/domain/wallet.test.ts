/**
 * wallet.test.ts — Unit tests for Wallet aggregate (RED phase, Plan 01-02)
 * TDD: written before implementation per CLAUDE.md mandate.
 * Renamed from account-domain.test.ts; Account → Wallet, AccountKind → WalletType.
 */
import { describe, test, expect } from "bun:test";
import { Wallet } from "../../src/domain/wallet";
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
    id: "wal-001",
    tenantId: "tenant-001",
    name: "My Wallet",
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

describe("Wallet domain", () => {
  describe("canChangeCurrency()", () => {
    test("always returns err — currency is immutable per ACCT-04", () => {
      const wal = makeWallet();
      const result = wal.canChangeCurrency();
      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().message).toMatch(/immutable/i);
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

  describe("walletType", () => {
    test("SPENDINGS walletType is valid", () => {
      const wal = makeWallet({ walletType: "SPENDINGS" });
      expect(wal.walletType).toBe("SPENDINGS");
    });

    test("CUSHION walletType is valid", () => {
      const wal = makeWallet({ walletType: "CUSHION" });
      expect(wal.walletType).toBe("CUSHION");
    });

    test("RESERVE walletType is valid", () => {
      const wal = makeWallet({ walletType: "RESERVE" });
      expect(wal.walletType).toBe("RESERVE");
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
