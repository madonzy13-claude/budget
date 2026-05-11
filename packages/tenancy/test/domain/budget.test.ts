/**
 * budget.test.ts — Unit tests for Budget domain entity (RED phase, Plan 01-02)
 * TDD: written before implementation per CLAUDE.md mandate.
 * Renamed from domain-unit.test.ts; Workspace → Budget.
 */
import { describe, test, expect } from "bun:test";
import { Budget } from "../../src/domain/budget";
import { Membership } from "../../src/domain/membership";
import { validateShares } from "../../src/domain/share";

function makeBudget(
  overrides: Partial<{
    id: string;
    slug: string;
    name: string;
    kind: "PRIVATE" | "SHARED";
    default_currency: string;
    ownerUserId: string;
    memberCount: number;
    createdAt: Date;
    cushionModeEnabled: boolean;
  }> = {},
): Budget {
  const defaults = {
    id: "bud-001",
    slug: "my-budget",
    name: "My Budget",
    kind: "PRIVATE" as const,
    default_currency: "USD",
    ownerUserId: "owner1",
    memberCount: 1,
    createdAt: new Date(),
    cushionModeEnabled: false,
  };
  const merged = { ...defaults, ...overrides };
  return new Budget(
    merged.id,
    merged.slug,
    merged.name,
    merged.kind,
    merged.default_currency,
    merged.ownerUserId,
    merged.memberCount,
    merged.createdAt,
    merged.cushionModeEnabled,
  );
}

describe("Budget.canAcceptMember", () => {
  test("PRIVATE with 0 members can accept", () => {
    const bud = makeBudget({ memberCount: 0 });
    expect(bud.canAcceptMember().isOk()).toBe(true);
  });

  test("PRIVATE with 1 member cannot accept (D-02)", () => {
    const bud = makeBudget({ memberCount: 1 });
    const r = bud.canAcceptMember();
    expect(r.isErr()).toBe(true);
    if (r.isErr()) expect(r.error.message).toMatch(/PRIVATE/);
  });

  test("SHARED with many members can accept", () => {
    const bud = makeBudget({ kind: "SHARED", memberCount: 5 });
    expect(bud.canAcceptMember().isOk()).toBe(true);
  });
});

describe("Budget.canBeLeftBy", () => {
  test("sole owner cannot leave (TENT-05)", () => {
    const bud = makeBudget({ kind: "PRIVATE", memberCount: 1 });
    const r = bud.canBeLeftBy("owner1", ["owner1"]);
    expect(r.isErr()).toBe(true);
    if (r.isErr()) expect(r.error.message).toMatch(/transfer ownership/i);
  });

  test("member (non-owner) can leave", () => {
    const bud = makeBudget({ kind: "SHARED", memberCount: 2 });
    const r = bud.canBeLeftBy("member2", ["owner1"]);
    expect(r.isOk()).toBe(true);
  });

  test("owner can leave if another owner exists", () => {
    const bud = makeBudget({ kind: "SHARED", memberCount: 2 });
    const r = bud.canBeLeftBy("owner1", ["owner1", "owner2"]);
    expect(r.isOk()).toBe(true);
  });
});

describe("Budget default_currency immutability (D-04)", () => {
  test("default_currency is readonly", () => {
    const bud = makeBudget({ default_currency: "USD" });
    expect(bud.default_currency).toBe("USD");
    expect(
      Object.getOwnPropertyDescriptor(bud, "default_currency"),
    ).toBeDefined();
  });
});

describe("Budget.cushionModeEnabled", () => {
  test("cushionModeEnabled defaults to false", () => {
    const bud = makeBudget();
    expect(bud.cushionModeEnabled).toBe(false);
  });

  test("cushionModeEnabled can be set to true", () => {
    const bud = makeBudget({ cushionModeEnabled: true });
    expect(bud.cushionModeEnabled).toBe(true);
  });
});

describe("Membership.canInvite", () => {
  test("owner can invite", () => {
    const m = new Membership("bud1", "u1", "owner", new Date());
    expect(m.canInvite()).toBe(true);
  });

  test("member cannot invite", () => {
    const m = new Membership("bud1", "u1", "member", new Date());
    expect(m.canInvite()).toBe(false);
  });
});

describe("validateShares (TENT-13, D-06)", () => {
  test("empty entries returns err", () => {
    expect(validateShares([]).isErr()).toBe(true);
  });

  test("shares summing to 100 returns ok", () => {
    const r = validateShares([
      { userId: "u1", percentage: "60" },
      { userId: "u2", percentage: "40" },
    ]);
    expect(r.isOk()).toBe(true);
  });

  test("shares summing to 99 returns err", () => {
    const r = validateShares([
      { userId: "u1", percentage: "50" },
      { userId: "u2", percentage: "49" },
    ]);
    expect(r.isErr()).toBe(true);
    if (r.isErr()) expect(r.error.message).toMatch(/sum to 100/);
  });

  test("negative share returns err", () => {
    const r = validateShares([
      { userId: "u1", percentage: "-10" },
      { userId: "u2", percentage: "110" },
    ]);
    expect(r.isErr()).toBe(true);
  });

  test("shares within 0.01 tolerance accepted", () => {
    const r = validateShares([
      { userId: "u1", percentage: "33.33" },
      { userId: "u2", percentage: "33.33" },
      { userId: "u3", percentage: "33.34" },
    ]);
    expect(r.isOk()).toBe(true);
  });
});
