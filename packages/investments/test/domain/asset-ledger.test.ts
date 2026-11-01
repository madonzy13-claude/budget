import { describe, test, expect } from "bun:test";
import {
  newestEntry,
  entryDateRange,
  deletableEntry,
  assertNotBeforeLatest,
  transferCost,
  brokerAdd,
  priceChange,
  type LedgerKey,
} from "../../src/domain/asset-ledger";

const e = (
  id: string,
  effectiveDate: string,
  createdAt: string,
  holdingId = "h1",
  transferId: string | null = null,
): LedgerKey => ({ id, effectiveDate, createdAt, transferId, holdingId });

describe("Newest entry", () => {
  test("picks the latest date, then the latest createdAt", () => {
    const a = e("a", "2026-10-01", "2026-10-01T10:00:00Z");
    const b = e("b", "2026-10-01", "2026-10-01T11:00:00Z");
    const c = e("c", "2026-09-30", "2026-10-27T09:00:00Z");
    expect(newestEntry([a, b, c])?.id).toBe("b");
  });

  test("breaks a full date + createdAt tie by id", () => {
    const a = e("a", "2026-10-01", "2026-10-01T10:00:00Z");
    const z = e("z", "2026-10-01", "2026-10-01T10:00:00Z");
    expect(newestEntry([z, a])?.id).toBe("z");
  });

  test("returns null for an empty ledger", () => {
    expect(newestEntry([])).toBeNull();
  });
});

describe("Deletable entry", () => {
  const old = e("old", "2026-09-01", "2026-09-01T00:00:00Z");
  const top = e("top", "2026-10-01", "2026-10-01T00:00:00Z");

  test("the newest single-leg entry is deletable", () => {
    expect(deletableEntry(top, [old, top], null)).toEqual({ ok: true });
  });

  test("an older entry is refused as not_newest", () => {
    expect(deletableEntry(old, [old, top], null)).toEqual({
      ok: false,
      reason: "not_newest",
    });
  });

  test("a linked leg needs to be newest in the partner asset too", () => {
    const leg = e("leg", "2026-10-02", "2026-10-02T00:00:00Z", "h1", "t1");
    const partnerLeg = e(
      "pl",
      "2026-10-02",
      "2026-10-02T00:00:00Z",
      "h2",
      "t1",
    );
    const later = e("later", "2026-10-03", "2026-10-03T00:00:00Z", "h2");
    expect(
      deletableEntry(leg, [old, leg], {
        entry: partnerLeg,
        partnerLive: [partnerLeg, later],
      }),
    ).toEqual({ ok: false, reason: "linked_not_newest" });
    expect(
      deletableEntry(leg, [old, leg], {
        entry: partnerLeg,
        partnerLive: [partnerLeg],
      }),
    ).toEqual({ ok: true });
  });
});

describe("Date guard", () => {
  test("refuses a date before the latest entry", () => {
    expect(() => assertNotBeforeLatest("2026-10-01", "2026-10-02")).toThrow(
      "before_latest_entry",
    );
  });

  test("allows the same date and an empty ledger", () => {
    expect(() =>
      assertNotBeforeLatest("2026-10-02", "2026-10-02"),
    ).not.toThrow();
    expect(() => assertNotBeforeLatest("2026-10-02", null)).not.toThrow();
  });
});

describe("Transfer cost", () => {
  test("moves cost proportionally with quantity", () => {
    expect(
      transferCost({ costCents: 10_000n, heldQty: "4", moveQty: "1" }),
    ).toEqual({ costMovedCents: 2_500n, qtyLeft: "3" });
  });

  test("a full move takes the whole cost with no residue", () => {
    expect(
      transferCost({ costCents: 10_001n, heldQty: "3", moveQty: "3" }),
    ).toEqual({ costMovedCents: 10_001n, qtyLeft: "0" });
  });

  test("refuses zero and more than held", () => {
    expect(() =>
      transferCost({ costCents: 10_000n, heldQty: "4", moveQty: "0" }),
    ).toThrow("move_qty_out_of_range");
    expect(() =>
      transferCost({ costCents: 10_000n, heldQty: "4", moveQty: "5" }),
    ).toThrow("move_qty_out_of_range");
  });
});

describe("Broker add", () => {
  test("books the deposit as cost + flow and the rest as market move (UI-SPEC example)", () => {
    expect(
      brokerAdd({
        amountCents: 1_000_000n,
        currentValueCents: 12_000_000n,
        valueAfterCents: 13_325_000n,
      }),
    ).toEqual({
      costDeltaCents: 1_000_000n,
      flowCents: 1_000_000n,
      valueDeltaCents: 1_325_000n,
      marketMoveCents: 325_000n,
    });
  });

  test("refuses a non-positive amount and a negative value after", () => {
    expect(() =>
      brokerAdd({
        amountCents: 0n,
        currentValueCents: 1n,
        valueAfterCents: 1n,
      }),
    ).toThrow("amount_positive");
    expect(() =>
      brokerAdd({
        amountCents: 1n,
        currentValueCents: 1n,
        valueAfterCents: -1n,
      }),
    ).toThrow("value_after_negative");
  });
});

describe("Price change", () => {
  test("keeps the prior price for snapshot undo", () => {
    expect(
      priceChange({ priorPriceCents: "120000", newPriceCents: "135000" }),
    ).toEqual({ priorPriceCents: "120000", newPriceCents: "135000" });
  });

  test("refuses a non-positive price", () => {
    expect(() =>
      priceChange({ priorPriceCents: "120000", newPriceCents: "0" }),
    ).toThrow("price_positive");
  });
});

// R6 (user): an entry's date can be edited between its neighbours.
describe("entryDateRange", () => {
  const k = (id: string, d: string, c = "2026-01-01T00:00:00Z") => ({
    id,
    effectiveDate: d,
    createdAt: c,
    transferId: null,
    holdingId: "h",
  });
  const list = [
    k("a", "2026-01-05"),
    k("b", "2026-02-10"),
    k("c", "2026-03-01"),
  ];

  test("a middle entry sits between the one before and the one after", () => {
    expect(entryDateRange(list, list[1]!)).toEqual({
      min: "2026-01-05",
      max: "2026-03-01",
    });
  });
  test("the first has no lower bound; the newest no upper bound", () => {
    expect(entryDateRange(list, list[0]!)).toEqual({
      min: null,
      max: "2026-02-10",
    });
    expect(entryDateRange(list, list[2]!)).toEqual({
      min: "2026-02-10",
      max: null,
    });
  });
  test("same-day neighbours keep their creation order", () => {
    const same = [
      k("x", "2026-04-01", "2026-04-01T10:00:00Z"),
      k("y", "2026-04-01", "2026-04-01T11:00:00Z"),
    ];
    expect(entryDateRange(same, same[1]!)).toEqual({
      min: "2026-04-01",
      max: null,
    });
  });
  // R6 (user, BTC - SafePal): two rows created at the same instant tie-break
  // by id, so landing on the neighbour's date could swap them. The bound
  // steps one day past a neighbour the tie-break would put on the wrong side.
  test("a neighbour's date is off-limits when the tie-break would swap them", () => {
    const at = "2026-10-26T05:33:46Z";
    const older = k("z", "2026-10-16", at); // id "z" sorts after "b"
    const newer = k("b", "2026-10-17", at);
    expect(entryDateRange([older, newer], newer)).toEqual({
      min: "2026-10-17",
      max: null,
    });
    expect(entryDateRange([older, newer], older)).toEqual({
      min: null,
      max: "2026-10-16",
    });
  });
});
