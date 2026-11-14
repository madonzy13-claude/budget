/**
 * reserve-settlement-task.test.ts — D-11..D-16 live: RESERVE wallets are summed
 * per currency (D-14 bug), the reserve need settles against them per currency,
 * and the RESERVE_TOPUP task carries one line per currency. Exact (D-13).
 *
 * Each case is its own budget; reserves are built with adjustments made in the
 * open month (1998-05), so need = the adjusted amount in each category currency.
 * "Today" (test clock) = 1998-05-15; rates seeded on 1998-05-01.
 */
import { describe, test, expect, afterAll } from "bun:test";
import { ReserveBudget } from "./currency-fixture";
import { convertCents } from "../../src/domain/fx-round";

const made: ReserveBudget[] = [];
async function budget(rates: [string, string, string][]) {
  const b = await new ReserveBudget().create("PLN");
  made.push(b);
  await b.rates(rates.map(([base, quote, rate]) => ({ base, quote, rate, date: "1998-05-01" })));
  return b;
}
async function need(b: ReserveBudget, ccy: string, cents: number) {
  const cat = await b.category(ccy);
  await b.adjust(cat, cents, ccy, "1998-05-02T12:00:00Z");
  return cat;
}

afterAll(async () => {
  for (const b of made) await b.drop();
});

describe.skipIf(!process.env.DATABASE_URL_APP)("Reserve settlement per currency", () => {
  test("RESERVE wallets in two currencies are not summed raw (D-14)", async () => {
    const b = await budget([["EUR", "PLN", "4.30"]]);
    await b.wallet("PLN", "100.00");
    await b.wallet("EUR", "100.00");
    const r = await b.positions();
    expect(r.userDefinedCents).not.toBe(20000n);
    expect(r.userDefinedCents).toBe(10000n + convertCents(10000n, "4.30"));
    expect(r.walletsByCurrency).toEqual(new Map([["PLN", 10000n], ["EUR", 10000n]]));
  });

  test("a surplus in one currency covers a shortfall in another (D-15)", async () => {
    const b = await budget([["EUR", "PLN", "4.3333"], ["PLN", "EUR", "0.23077"]]);
    await need(b, "PLN", 100000);
    await need(b, "EUR", 10000);
    await b.wallet("PLN", "1200.00");
    await b.wallet("EUR", "70.00");
    const p = await b.task();
    expect(p).toMatchObject({ direction: "WITHDRAW", shortfall_cents: "7000", currency: "PLN" });
    expect(p!.lines).toEqual([{ currency: "PLN", shortfall_cents: "7000", direction: "WITHDRAW" }]);
  });

  test("each short currency is its own line, ≈ budget currency where it has no wallet (D-12/D-16)", async () => {
    const b = await budget([["EUR", "PLN", "4.2667"]]);
    await need(b, "PLN", 12000);
    await need(b, "EUR", 1500);
    await b.wallet("PLN", "0.00");
    const p = await b.task();
    expect(p!.direction).toBe("TOPUP");
    expect(p!.lines).toEqual([
      { currency: "PLN", shortfall_cents: "12000", direction: "TOPUP" },
      { currency: "EUR", shortfall_cents: "1500", direction: "TOPUP", equiv: { currency: "PLN", cents: "6400" } },
    ]);
  });

  test("exactly covered resolves the task; a one-cent remainder reopens it (D-13)", async () => {
    const b = await budget([["EUR", "PLN", "4.00"], ["PLN", "EUR", "0.25"]]);
    await need(b, "PLN", 10000);
    await need(b, "EUR", 1000);
    await b.wallet("PLN", "100.00");
    await b.wallet("EUR", "10.00");
    expect(await b.task()).toBeNull();
    // An extra 0.01 PLN in the wallet is a 1-cent surplus — exact, no tolerance.
    await b.wallet("PLN", "0.01");
    const p = await b.task();
    expect(p).toMatchObject({ direction: "WITHDRAW", shortfall_cents: "1" });
  });

  test("a single-currency budget keeps the old payload plus one line", async () => {
    const b = await budget([]);
    await need(b, "PLN", 5000);
    await b.wallet("PLN", "48.00");
    const p = await b.task();
    expect(p).toEqual({
      shortfall_cents: "200",
      direction: "TOPUP",
      currency: "PLN",
      lines: [{ currency: "PLN", shortfall_cents: "200", direction: "TOPUP" }],
    });
  });
});
