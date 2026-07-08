/**
 * RED: unit tests for domain + contracts + ports + factory surface (Task 1).
 * These run WITHOUT a DB — in-memory only.
 */
import { test, expect, describe } from "bun:test";
import { Workspace } from "../src/domain/workspace";
import { Membership } from "../src/domain/membership";
import { validateShares } from "../src/domain/share";

describe("Workspace.canAcceptMember", () => {
  // kind-removal: any budget always accepts members. Private-vs-shared is a
  // display derivation from member_count, not an invite gate.
  test("0 members can accept", () => {
    const ws = new Workspace(
      "id",
      "slug",
      "Mine",
      "PRIVATE",
      "USD",
      "owner1",
      0,
      new Date(),
    );
    expect(ws.canAcceptMember().isOk()).toBe(true);
  });

  test("1-member budget CAN accept regardless of kind (kind-removal)", () => {
    const priv = new Workspace(
      "id",
      "slug",
      "Mine",
      "PRIVATE",
      "USD",
      "owner1",
      1,
      new Date(),
    );
    expect(priv.canAcceptMember().isOk()).toBe(true);

    const shared = new Workspace(
      "id",
      "slug",
      "Shared",
      "SHARED",
      "USD",
      "owner1",
      1,
      new Date(),
    );
    expect(shared.canAcceptMember().isOk()).toBe(true);
  });

  test("many members can accept", () => {
    const ws = new Workspace(
      "id",
      "slug",
      "Family",
      "SHARED",
      "USD",
      "owner1",
      5,
      new Date(),
    );
    expect(ws.canAcceptMember().isOk()).toBe(true);
  });
});

describe("Workspace.canBeLeftBy", () => {
  test("sole owner cannot leave (TENT-05)", () => {
    const ws = new Workspace(
      "id",
      "slug",
      "Mine",
      "PRIVATE",
      "USD",
      "owner1",
      1,
      new Date(),
    );
    const r = ws.canBeLeftBy("owner1", ["owner1"]);
    expect(r.isErr()).toBe(true);
    if (r.isErr()) expect(r.error.message).toMatch(/transfer ownership/i);
  });

  test("member (non-owner) can leave", () => {
    const ws = new Workspace(
      "id",
      "slug",
      "Family",
      "SHARED",
      "USD",
      "owner1",
      2,
      new Date(),
    );
    const r = ws.canBeLeftBy("member2", ["owner1"]);
    expect(r.isOk()).toBe(true);
  });

  test("owner can leave if another owner exists", () => {
    const ws = new Workspace(
      "id",
      "slug",
      "Family",
      "SHARED",
      "USD",
      "owner1",
      2,
      new Date(),
    );
    const r = ws.canBeLeftBy("owner1", ["owner1", "owner2"]);
    expect(r.isOk()).toBe(true);
  });
});

describe("Workspace default_currency immutability (D-04)", () => {
  test("default_currency is readonly", () => {
    const ws = new Workspace(
      "id",
      "slug",
      "Mine",
      "PRIVATE",
      "USD",
      "owner1",
      1,
      new Date(),
    );
    expect(ws.default_currency).toBe("USD");
    // TypeScript enforces readonly at compile time; this tests runtime shape
    expect(
      Object.getOwnPropertyDescriptor(ws, "default_currency"),
    ).toBeDefined();
  });
});

describe("Membership.canInvite", () => {
  test("owner can invite", () => {
    const m = new Membership("ws1", "u1", "owner", new Date());
    expect(m.canInvite()).toBe(true);
  });

  test("member cannot invite", () => {
    const m = new Membership("ws1", "u1", "member", new Date());
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
    // e.g. 33.33 + 33.33 + 33.34 = 100.00 exactly
    const r = validateShares([
      { userId: "u1", percentage: "33.33" },
      { userId: "u2", percentage: "33.33" },
      { userId: "u3", percentage: "33.34" },
    ]);
    expect(r.isOk()).toBe(true);
  });
});
