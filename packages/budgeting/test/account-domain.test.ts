/**
 * account-domain.test.ts — Unit tests for Account aggregate (RED phase)
 * TDD: written before implementation per CLAUDE.md mandate.
 */
import { describe, test, expect } from "bun:test";
import { Account } from "../src/domain/account";
import { Money } from "@budget/shared-kernel";

function makeAccount(
  overrides: Partial<ConstructorParameters<typeof Account>[0]> = {},
): Account {
  const defaults = {
    id: "acc-001",
    tenantId: "tenant-001",
    name: "My Account",
    kind: "CASH" as const,
    scope: "PERSONAL" as const,
    currency: "EUR",
    currentBalance: Money.of("0", "EUR" as any),
    archivedAt: null,
    createdAt: new Date("2026-01-01"),
    actorUserId: "user-001",
  };
  const merged = { ...defaults, ...overrides };
  return new Account(
    merged.id,
    merged.tenantId,
    merged.name,
    merged.kind,
    merged.scope,
    merged.currency,
    merged.currentBalance,
    merged.archivedAt,
    merged.createdAt,
    merged.actorUserId,
  );
}

describe("Account domain", () => {
  describe("canChangeCurrency()", () => {
    test("always returns err — currency is immutable per ACCT-04", () => {
      const acc = makeAccount();
      const result = acc.canChangeCurrency();
      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().message).toMatch(/immutable/i);
    });
  });

  describe("archive()", () => {
    test("sets archivedAt on first call", () => {
      const acc = makeAccount({ archivedAt: null });
      const result = acc.archive();
      expect(result.isOk()).toBe(true);
      expect(acc.archivedAt).toBeInstanceOf(Date);
    });

    test("returns err on double-archive", () => {
      const acc = makeAccount({ archivedAt: new Date() });
      const result = acc.archive();
      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().message).toMatch(/already archived/i);
    });
  });

  describe("applyAdjustment()", () => {
    test("returns err when delta currency != account currency", () => {
      const acc = makeAccount({
        currency: "EUR",
        currentBalance: Money.of("100", "EUR" as any),
      });
      const deltaPLN = Money.of("50", "PLN" as any);
      const result = acc.applyAdjustment(deltaPLN);
      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().message).toMatch(/PLN.*EUR|currency/i);
    });

    test("updates currentBalance when delta currency matches account currency", () => {
      const acc = makeAccount({
        currency: "EUR",
        currentBalance: Money.of("100", "EUR" as any),
      });
      const deltaEUR = Money.of("25", "EUR" as any);
      const result = acc.applyAdjustment(deltaEUR);
      expect(result.isOk()).toBe(true);
      expect(acc.currentBalance.amount.toFixed(2)).toBe("125.00");
    });
  });

  describe("isLiability() / isAsset()", () => {
    test("CREDIT_CARD is a liability", () => {
      const acc = makeAccount({ kind: "CREDIT_CARD" });
      expect(acc.isLiability()).toBe(true);
      expect(acc.isAsset()).toBe(false);
    });

    test("LOAN is a liability", () => {
      const acc = makeAccount({ kind: "LOAN" });
      expect(acc.isLiability()).toBe(true);
    });

    test("CASH is an asset", () => {
      const acc = makeAccount({ kind: "CASH" });
      expect(acc.isLiability()).toBe(false);
      expect(acc.isAsset()).toBe(true);
    });

    test("CHECKING is an asset", () => {
      const acc = makeAccount({ kind: "CHECKING" });
      expect(acc.isAsset()).toBe(true);
    });

    test("SAVINGS is an asset", () => {
      const acc = makeAccount({ kind: "SAVINGS" });
      expect(acc.isAsset()).toBe(true);
    });

    test("INVESTMENT is an asset", () => {
      const acc = makeAccount({ kind: "INVESTMENT" });
      expect(acc.isAsset()).toBe(true);
    });
  });

  describe("isArchived()", () => {
    test("returns false when archivedAt is null", () => {
      const acc = makeAccount({ archivedAt: null });
      expect(acc.isArchived()).toBe(false);
    });

    test("returns true when archivedAt is set", () => {
      const acc = makeAccount({ archivedAt: new Date() });
      expect(acc.isArchived()).toBe(true);
    });
  });
});
