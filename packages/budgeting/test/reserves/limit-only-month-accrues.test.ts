/**
 * limit-only-month-accrues.test.ts — owner, 261104: "I added a limit to
 * September of 500 zł, but the reserve for next month didn't update; only
 * after I added a transaction to September did the leftover appear."
 *
 * A closed month with a limit and NO spending leaves its whole limit over —
 * it accrues into the reserve like any other leftover. The replay used to
 * read limits only for months that had spending, so such a month never ran.
 * Test clock: open month 1998-05.
 */
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { ReserveBudget } from "./currency-fixture";

const b = new ReserveBudget();
let cat: string;

describe.skipIf(!process.env.DATABASE_URL_APP)("A month with a limit and no spending", () => {
  beforeAll(async () => {
    await b.create("PLN");
    cat = await b.category("PLN");
    // March only: 500 zł, nothing spent.
    await b.limit(cat, 50000, "PLN", "1998-03-01", "1998-03-31");
  });
  afterAll(() => b.drop());

  test("its whole limit is left over into the reserve", async () => {
    const r = await b.positions();
    expect(r.positions.get(cat)?.reserveCents).toBe(50000n);
  });

  // UAT 14, owner 261105: "June doesn't show reserve while there's leftover
  // in May". A later month with no limit and no spending still holds the
  // reserve carried into it — it needs its own cell to show it.
  test("a later month with no limit or spending shows the carried reserve", async () => {
    const r = await b.positions();
    const byMonth = r.positions.get(cat)!.byMonth;
    for (const m of ["1998-04", "1998-05"]) {
      const cell = byMonth.get(m);
      expect(cell?.usedCents).toBe(0n);
      expect(cell?.endReserveCents).toBe(50000n);
    }
  });
});
