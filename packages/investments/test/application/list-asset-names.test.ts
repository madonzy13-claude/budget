/**
 * list-asset-names.test.ts — the name autocomplete (13.1 D-02): each name
 * carries its quantity and value so the list says what each asset is
 * (round-4 gap 4).
 */
import { describe, test, expect } from "bun:test";
import { listAssetNames } from "../../src/application/list-asset-names";
import { MemoryWorld, hold, T } from "./memory-world";

describe("List asset names", () => {
  test("names carry a trimmed quantity and the value", async () => {
    const w = new MemoryWorld(
      [
        {
          id: "acme",
          name: "ACME",
          holdingType: "equities",
          uiType: "stocks",
          buy: 2_500n,
          qty: "10.00000000",
          current: 2_500n,
        },
      ].map(hold),
    );
    const rows = (
      await listAssetNames({ holdingRepo: w.holdingRepo })({
        tenantId: T,
        budgetId: T,
        uiType: "stocks",
      })
    )._unsafeUnwrap();
    expect(rows[0]).toMatchObject({
      name: "ACME",
      quantity: "10",
      valueCents: "25000",
    });
  });

  // Round-5: same-name assets are told apart by unit, amount and currency.
  test("names carry the unit and a value currency even when unpriced", async () => {
    const w = new MemoryWorld(
      [
        {
          id: "gold",
          name: "Gold",
          holdingType: "commodity",
          uiType: "precious_metals",
          buy: 100n,
          buyCcy: "EUR",
          qty: "3",
          current: null,
          uom: "oz",
        },
      ].map(hold),
    );
    const rows = (
      await listAssetNames({ holdingRepo: w.holdingRepo })({
        tenantId: T,
        budgetId: T,
        uiType: "precious_metals",
      })
    )._unsafeUnwrap();
    expect(rows[0]).toMatchObject({
      unitOfMeasure: "oz",
      symbol: null,
      valueCurrency: "EUR",
    });
  });
});
