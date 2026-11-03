/**
 * reserve-replay-currency-change.test.ts — D-17: after a category's currency
 * changes, its reserve is in the NEW currency, rebuilt month by month.
 *
 * Category C: PLN in M1 (1998-03) and M2 (1998-04), EUR from M3 (1998-05, open).
 * PLN→EUR: 03-31 0.25 · 04-10 0.245 · 04-20 0.24.
 *
 *   M1  limit 1000 PLN, spent 600 PLN → leftover 400 PLN
 *       → EUR at the month's closing rate (03-31, 0.25)          = +100.00 EUR
 *   M2  adjustment +40 PLN on 04-10 → at its own date (0.245)    =  +9.80 EUR
 *       limit 1000 PLN; 800 PLN on 04-05, 500 PLN on 04-20 → over by 300 PLN,
 *       all of it from the 04-20 payment (04-05 stayed under the limit)
 *       → EUR at 04-20 (0.24)                                    = −72.00 EUR
 *   R at M3 = 100.00 + 9.80 − 72.00 = 37.80 EUR
 *
 * R (100) already covers the 72 overspend, so the order adjust/spend fold in
 * within M2 does not change the result.
 */
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { ReserveBudget } from "./currency-fixture";

const b = new ReserveBudget();
let C: string;
let X: string;

describe.skipIf(!process.env.DATABASE_URL_APP)("Reserve replay across a category currency change", () => {
  beforeAll(async () => {
    await b.create("PLN");
    await b.rates([
      { base: "PLN", quote: "EUR", date: "1998-03-31", rate: "0.25" },
      { base: "PLN", quote: "EUR", date: "1998-04-10", rate: "0.245" },
      { base: "PLN", quote: "EUR", date: "1998-04-20", rate: "0.24" },
    ]);
    C = await b.category("EUR");
    await b.limit(C, 100000, "PLN", "1998-03-01", "1998-05-01");
    await b.limit(C, 25000, "EUR", "1998-05-01");
    await b.tx(C, "1998-03-10", 60000, "PLN");
    await b.tx(C, "1998-04-05", 80000, "PLN");
    await b.tx(C, "1998-04-20", 50000, "PLN");
    await b.adjust(C, 4000, "PLN", "1998-04-10T12:00:00Z");
  });
  afterAll(() => b.drop());

  test("past months convert their result into the new currency (golden 37.80 EUR)", async () => {
    expect((await b.positions()).positions.get(C)?.reserveCents).toBe(3780n);
  });

  test("closed months never move when a later rate arrives", async () => {
    await b.rates([{ base: "PLN", quote: "EUR", date: "1998-05-15", rate: "0.10" }]);
    expect((await b.positions()).positions.get(C)?.reserveCents).toBe(3780n);
  });

  test("months after the change are native; a foreign payment converts at its date", async () => {
    await b.tx(C, "1998-05-02", 1000, "EUR"); // under the 250 EUR limit — no draw
    await b.tx(C, "1998-05-03", 1000000, "PLN"); // 10000 PLN × 0.24 (latest ≤ 05-03) = 2400 EUR
    const pos = (await b.positions()).positions.get(C)!;
    // 10 + 2400 = 2410 EUR spent vs 250 limit → overspend 2160, reserve 37.80 drawn to 0.
    expect(pos.byMonth.get("1998-05")?.overageCents).toBe(216000n);
    expect(pos.reserveCents).toBe(0n);
  });

  test("a payment with no FX pair is skipped and flagged, the replay still answers", async () => {
    X = await b.category("PLN");
    await b.limit(X, 1000, "PLN", "1998-05-01");
    await b.tx(X, "1998-05-04", 500, "ZZQ");
    const r = await b.positions();
    expect(r.fxUnavailable).toBe(true);
    expect(r.positions.get(X)?.byMonth.get("1998-05")?.overageCents ?? 0n).toBe(0n);
  });
});
