/**
 * wallet.test.ts — Unit tests for Wallet aggregate (Plan 05-02 extends Plan 01-02)
 * TDD: new mutator tests written RED-first; existing tests preserved.
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
  // ──────────────────────────────────────────────────────────────────────
  // Phase 5 Plan 02: D-PH5-W12 rescinds WALT-04 currency immutability
  // ──────────────────────────────────────────────────────────────────────
  describe("canChangeCurrency() — D-PH5-W12 rescission", () => {
    test("returns ok(undefined) — WALT-04 rescinded per D-PH5-W12", () => {
      const wal = makeWallet();
      const result = wal.canChangeCurrency();
      expect(result.isOk()).toBe(true);
    });
  });

  // ──────────────────────────────────────────────────────────────────────
  // rename()
  // ──────────────────────────────────────────────────────────────────────
  describe("rename()", () => {
    test("succeeds and updates name", () => {
      const wal = makeWallet({ name: "Old Name" });
      const result = wal.rename("New Name");
      expect(result.isOk()).toBe(true);
      expect(wal.name).toBe("New Name");
    });

    test("trims whitespace", () => {
      const wal = makeWallet({ name: "Old" });
      const result = wal.rename("  Trimmed  ");
      expect(result.isOk()).toBe(true);
      expect(wal.name).toBe("Trimmed");
    });

    test("returns err for empty name", () => {
      const wal = makeWallet();
      const result = wal.rename("");
      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().message).toMatch(/name/i);
    });

    test("returns err for whitespace-only name", () => {
      const wal = makeWallet();
      const result = wal.rename("   ");
      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().message).toMatch(/name/i);
    });

    test("returns err for name over 120 chars", () => {
      const wal = makeWallet();
      const result = wal.rename("X".repeat(121));
      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().message).toMatch(/120/);
    });

    test("accepts name exactly 120 chars", () => {
      const wal = makeWallet();
      const result = wal.rename("A".repeat(120));
      expect(result.isOk()).toBe(true);
      expect(wal.name).toHaveLength(120);
    });
  });

  // ──────────────────────────────────────────────────────────────────────
  // changeType()
  // ──────────────────────────────────────────────────────────────────────
  describe("changeType()", () => {
    test("succeeds and updates walletType", () => {
      const wal = makeWallet({ walletType: "SPENDINGS" });
      const result = wal.changeType("RESERVE");
      expect(result.isOk()).toBe(true);
      expect(wal.walletType).toBe("RESERVE");
    });

    test("can change to CUSHION", () => {
      const wal = makeWallet({ walletType: "SPENDINGS" });
      const result = wal.changeType("CUSHION");
      expect(result.isOk()).toBe(true);
      expect(wal.walletType).toBe("CUSHION");
    });
  });

  // ──────────────────────────────────────────────────────────────────────
  // changeCurrency()
  // ──────────────────────────────────────────────────────────────────────
  describe("changeCurrency()", () => {
    test("succeeds and updates currency", () => {
      const wal = makeWallet({ currency: "EUR" });
      const result = wal.changeCurrency("USD");
      expect(result.isOk()).toBe(true);
      expect(wal.currency).toBe("USD");
    });

    test("does NOT mutate currentBalance amount — only currency tag changes at DB layer", () => {
      const wal = makeWallet({
        currency: "EUR",
        currentBalance: Money.of("500.00", "EUR" as any),
      });
      const result = wal.changeCurrency("USD");
      expect(result.isOk()).toBe(true);
      // The in-memory Money object's numeric amount is preserved
      expect(wal.currentBalance.amount.toFixed(2)).toBe("500.00");
    });

    test("accepts 3-char crypto code", () => {
      const wal = makeWallet({ currency: "EUR" });
      const result = wal.changeCurrency("BTC");
      expect(result.isOk()).toBe(true);
      expect(wal.currency).toBe("BTC");
    });

    test("normalises to uppercase", () => {
      const wal = makeWallet({ currency: "EUR" });
      const result = wal.changeCurrency("usd");
      expect(result.isOk()).toBe(true);
      expect(wal.currency).toBe("USD");
    });

    test("returns err for invalid currency code (too short)", () => {
      const wal = makeWallet({ currency: "EUR" });
      const result = wal.changeCurrency("AB");
      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().message).toMatch(/currency/i);
    });

    test("returns err for invalid currency code (too long)", () => {
      const wal = makeWallet({ currency: "EUR" });
      const result = wal.changeCurrency("TOOLONG");
      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().message).toMatch(/currency/i);
    });
  });

  // ──────────────────────────────────────────────────────────────────────
  // setAmount()
  // ──────────────────────────────────────────────────────────────────────
  describe("setAmount()", () => {
    test("succeeds when amount currency matches wallet currency", () => {
      const wal = makeWallet({
        currency: "EUR",
        currentBalance: Money.of("50.00", "EUR" as any),
      });
      const result = wal.setAmount(Money.of("100.00", "EUR" as any));
      expect(result.isOk()).toBe(true);
      expect(wal.currentBalance.amount.toFixed(2)).toBe("100.00");
    });

    test("returns err when amount currency != wallet currency", () => {
      const wal = makeWallet({
        currency: "EUR",
        currentBalance: Money.of("50.00", "EUR" as any),
      });
      const result = wal.setAmount(Money.of("100.00", "USD" as any));
      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().message).toMatch(/currency/i);
    });
  });

  // ──────────────────────────────────────────────────────────────────────
  // Existing tests — must remain green after mutations are added
  // ──────────────────────────────────────────────────────────────────────
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
