import { describe, test, expect } from "bun:test";
import {
  Holding,
  HOLDING_TYPES,
  isHoldingType,
  type HoldingType,
} from "../../src/domain/holding";

interface Init {
  id?: string;
  tenantId?: string;
  name?: string;
  holdingType?: HoldingType;
  group?: string | null;
  instrumentId?: string | null;
  buyPriceCents?: bigint | null;
  buyCurrency?: string | null;
  quantity?: string;
  currentPriceCents?: bigint | null;
  currentPriceCurrency?: string | null;
  sortOrder?: number;
  archivedAt?: Date | null;
  createdAt?: Date;
}

// NOTE: nullable fields use `=== undefined` (not `??`) so an explicit `null`
// (e.g. instrumentId: null, buyPriceCents: null) is preserved, not defaulted.
export const mk = (o: Init = {}): Holding =>
  new Holding(
    o.id ?? "h1",
    o.tenantId ?? "t1",
    o.name ?? "Apple",
    o.holdingType ?? "equities",
    o.group === undefined ? null : o.group,
    o.instrumentId === undefined ? "i1" : o.instrumentId,
    o.buyPriceCents === undefined ? 10000n : o.buyPriceCents,
    o.buyCurrency === undefined ? "USD" : o.buyCurrency,
    o.quantity ?? "1",
    o.currentPriceCents === undefined ? 10000n : o.currentPriceCents,
    o.currentPriceCurrency === undefined ? "USD" : o.currentPriceCurrency,
    o.sortOrder ?? 0,
    o.archivedAt === undefined ? null : o.archivedAt,
    o.createdAt ?? new Date("2026-01-01T00:00:00Z"),
  );

describe("Holding entity", () => {
  test("constructs with each of the 9 valid holding types", () => {
    for (const t of HOLDING_TYPES) {
      const h = mk({ holdingType: t });
      expect(h.holdingType).toBe(t);
    }
    expect(HOLDING_TYPES).toHaveLength(9);
  });

  test("isHoldingType guards the locked 9-value union", () => {
    expect(isHoldingType("equities")).toBe(true);
    expect(isHoldingType("cash_fx")).toBe(true);
    expect(isHoldingType("real_estate")).toBe(true);
    expect(isHoldingType("other")).toBe(true);
    expect(isHoldingType("stonks")).toBe(false);
    expect(isHoldingType("")).toBe(false);
  });

  test("isCash() is true only for cash_fx", () => {
    expect(mk({ holdingType: "cash_fx" }).isCash()).toBe(true);
    expect(mk({ holdingType: "equities" }).isCash()).toBe(false);
    expect(mk({ holdingType: "real_estate" }).isCash()).toBe(false);
  });

  test("isCustom() is true only when instrumentId is null", () => {
    expect(mk({ instrumentId: null }).isCustom()).toBe(true);
    expect(mk({ instrumentId: "i1" }).isCustom()).toBe(false);
  });

  test("isArchived() reflects archivedAt", () => {
    expect(mk({ archivedAt: null }).isArchived()).toBe(false);
    expect(mk({ archivedAt: new Date() }).isArchived()).toBe(true);
  });
});
