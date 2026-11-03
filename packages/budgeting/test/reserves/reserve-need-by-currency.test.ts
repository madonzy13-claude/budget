/**
 * reserve-need-by-currency.test.ts — D-10: each category's reserve is held in
 * that category's currency, so the total need is one amount per currency.
 */
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { ReserveBudget } from "./currency-fixture";

const b = new ReserveBudget();
let P: string;
let E: string;

describe.skipIf(!process.env.DATABASE_URL_APP)("Reserve need per currency", () => {
  beforeAll(async () => {
    await b.create("PLN");
    await b.rates([{ base: "PLN", quote: "EUR", date: "1998-03-05", rate: "0.25" }]);
    P = await b.category("PLN");
    E = await b.category("EUR");
    await b.limit(P, 100000, "PLN", "1998-03-01");
    await b.limit(E, 10000, "EUR", "1998-03-01");
    await b.tx(P, "1998-03-05", 80000, "PLN"); // leftover 200.00 PLN
    await b.tx(E, "1998-03-05", 8600, "PLN"); // 86.00 PLN × 0.25 = 21.50 EUR → leftover 78.50 EUR
  });
  afterAll(() => b.drop());

  test("each category's reserve is held in its own currency", async () => {
    const r = await b.positions();
    expect(r.positions.get(P)?.reserveCents).toBe(20000n);
    expect(r.positions.get(E)?.reserveCents).toBe(7850n);
    expect(r.internalByCurrency).toEqual(
      new Map([
        ["PLN", 20000n],
        ["EUR", 7850n],
      ]),
    );
  });
});
