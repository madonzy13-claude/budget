import { describe, test, expect } from "bun:test";
import {
  centsString,
  positiveCents,
  positiveQty,
  uuidParam,
  editAssetSchema,
  buyAssetSchema,
  sellAssetSchema,
  transferAssetSchema,
  assetNamesQuerySchema,
  INVESTMENT_ERRORS,
} from "../../src/contracts/api";

const ok = (
  s: { safeParse: (v: unknown) => { success: boolean } },
  v: unknown,
) => s.safeParse(v).success;

const UUID = "0b0a4f3e-6e2a-4c1d-9b7a-2f1e8d3c4b5a";

describe("Asset contracts", () => {
  test("centsString takes plain non-negative integers only (WR-01)", () => {
    for (const bad of ["12.5", "1e3", "-5", "", " 5", "1,000"])
      expect(ok(centsString, bad)).toBe(false);
    expect(ok(centsString, "0")).toBe(true);
    expect(ok(centsString, "1250")).toBe(true);
  });

  test("positiveCents refuses zero; positiveQty refuses zero, negatives and >8 decimals (CR-03, IN-02)", () => {
    expect(ok(positiveCents, "0")).toBe(false);
    expect(ok(positiveCents, "1")).toBe(true);
    for (const bad of ["0", "-1", "0.000000001"])
      expect(ok(positiveQty, bad)).toBe(false);
    expect(positiveQty.parse("0,5")).toBe("0.5");
    expect(ok(positiveQty, "0.00000001")).toBe(true);
  });

  test("uuidParam rejects a non-uuid (WR-02)", () => {
    expect(ok(uuidParam, "abc")).toBe(false);
    expect(ok(uuidParam, UUID)).toBe(true);
  });

  test("edit is strict: ledger-owned fields and empty bodies are refused (D-06, CR-01)", () => {
    expect(ok(editAssetSchema, { quantity: "2" })).toBe(false);
    expect(ok(editAssetSchema, { buyPriceCents: "1" })).toBe(false);
    expect(ok(editAssetSchema, { uiType: "crypto" })).toBe(false);
    expect(ok(editAssetSchema, {})).toBe(false);
    expect(editAssetSchema.parse({ name: " BTC " })).toEqual({ name: "BTC" });
  });

  test("buy: broker accepts value-after 0, quantity kind refuses price 0 (D-08)", () => {
    const d = "2026-10-01";
    expect(
      ok(buyAssetSchema, {
        kind: "broker",
        amountCents: "1000",
        valueAfterCents: "0",
        effectiveDate: d,
      }),
    ).toBe(true);
    expect(
      ok(buyAssetSchema, {
        kind: "quantity",
        quantity: "1",
        priceCents: "0",
        currency: "USD",
        effectiveDate: d,
      }),
    ).toBe(false);
    expect(
      ok(buyAssetSchema, {
        kind: "quantity",
        quantity: "1",
        priceCents: "10",
        currency: "USD",
        effectiveDate: d,
      }),
    ).toBe(true);
    expect(
      ok(buyAssetSchema, {
        kind: "amount",
        amountCents: "0",
        currency: "PLN",
        effectiveDate: d,
      }),
    ).toBe(false);
    expect(
      ok(buyAssetSchema, {
        kind: "amount",
        amountCents: "5",
        currency: "PLN",
        effectiveDate: "2999-01-01",
      }),
    ).toBe(false);
  });

  test("sell: Out without a wallet means nowhere; bad wallet targets are refused (D-20, D-22, D-23)", () => {
    const base = {
      effectiveDate: "2026-10-01",
      left: { quantity: "0" },
      receivedCents: "100",
      receivedCurrency: "PLN",
    };
    const p = sellAssetSchema.parse({ ...base, destination: { kind: "out" } });
    expect(p.destination).toEqual({ kind: "out", wallet: { kind: "nowhere" } });
    expect(
      ok(sellAssetSchema, {
        ...base,
        destination: {
          kind: "out",
          wallet: { kind: "existing", walletId: "bad" },
        },
      }),
    ).toBe(false);
    expect(
      ok(sellAssetSchema, {
        ...base,
        destination: {
          kind: "out",
          wallet: {
            kind: "new",
            name: "Bank",
            walletType: "BANK",
            currency: "PLN",
          },
        },
      }),
    ).toBe(false);
    expect(
      ok(sellAssetSchema, {
        ...base,
        destination: {
          kind: "out",
          wallet: {
            kind: "new",
            name: "Bank",
            walletType: "SPENDINGS",
            currency: "PLN",
          },
        },
      }),
    ).toBe(true);
    expect(
      ok(sellAssetSchema, {
        ...base,
        receivedCents: "0",
        destination: { kind: "out" },
      }),
    ).toBe(false);
    expect(
      ok(sellAssetSchema, {
        ...base,
        left: { quantity: "0.000000001" },
        destination: { kind: "out" },
      }),
    ).toBe(false);
    expect(
      ok(sellAssetSchema, {
        ...base,
        left: { valueCents: "12.5" },
        destination: { kind: "out" },
      }),
    ).toBe(false);
  });

  test("transfer: a blank new label is refused after trim (D-10)", () => {
    const base = { effectiveDate: "2026-10-01", move: { quantity: "1" } };
    expect(
      ok(transferAssetSchema, { ...base, to: { kind: "new", name: "  " } }),
    ).toBe(false);
    expect(
      ok(transferAssetSchema, {
        ...base,
        to: { kind: "existing", holdingId: UUID },
      }),
    ).toBe(true);
    expect(
      ok(transferAssetSchema, {
        ...base,
        to: { kind: "existing", holdingId: "x" },
      }),
    ).toBe(false);
  });

  test("names query takes a ui type; error vocabulary has the LIFO codes", () => {
    expect(ok(assetNamesQuerySchema, { type: "crypto" })).toBe(true);
    expect(ok(assetNamesQuerySchema, { type: "nope" })).toBe(false);
    expect(INVESTMENT_ERRORS[409]).toContain("not_newest");
    // Round-5 scope change: no uniqueness codes remain.
    expect(INVESTMENT_ERRORS[422]).not.toContain("label_taken");
    expect(INVESTMENT_ERRORS[422]).not.toContain("instrument_mismatch");
    expect(INVESTMENT_ERRORS[404]).toContain("not_found");
  });
});
