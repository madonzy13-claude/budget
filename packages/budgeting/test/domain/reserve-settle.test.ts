// settleReserveByCurrency — per-currency reserve need vs per-currency RESERVE
// wallets. D-11 own currency first (FX-free), D-15 net across currencies at
// today's rate, D-13 exact (no tolerance), D-16 "≈" in the budget currency.
import { describe, test, expect } from "bun:test";
import {
  settleReserveByCurrency,
  type ReserveSettlement,
} from "../../src/domain/reserve-settle";

type Rates = Record<string, string>;
const rateFn = (rates: Rates) => (from: string, to: string) =>
  rates[`${from}${to}`] ?? null;

const settle = (input: {
  need: Record<string, bigint>;
  wallets: Record<string, bigint>;
  walletCcys: string[];
  rates?: Rates;
  budget?: string;
}): ReserveSettlement =>
  settleReserveByCurrency({
    needByCurrency: new Map(Object.entries(input.need)),
    walletsByCurrency: new Map(Object.entries(input.wallets)),
    reserveWalletCurrencies: new Set(input.walletCcys),
    budgetCurrency: input.budget ?? "PLN",
    rate: rateFn(input.rates ?? {}),
  });

describe("Reserve settlement", () => {
  test("nets a surplus in one currency against a shortfall in another (D-15)", () => {
    const s = settle({
      need: { PLN: 100000n, EUR: 10000n },
      wallets: { PLN: 120000n, EUR: 7000n },
      walletCcys: ["PLN", "EUR"],
      rates: { EURPLN: "4.3333", PLNEUR: "0.23077" },
    });
    // PLN +20000, EUR −3000 ≈ −13000 PLN → net +7000 PLN.
    expect(s.netBudgetCents).toBe(7000n);
    expect(s.direction).toBe("WITHDRAW");
    expect(s.lines).toEqual([{ currency: "PLN", cents: 7000n, direction: "WITHDRAW" }]);
  });

  test("a single-currency reserve never depends on FX (D-11)", () => {
    const input = {
      need: { PLN: 50000n },
      wallets: { PLN: 48000n },
      walletCcys: ["PLN"],
    };
    const a = settle(input);
    const b = settle({ ...input, rates: { PLNEUR: "0.1", EURPLN: "10" } });
    expect(a.lines).toEqual([{ currency: "PLN", cents: 2000n, direction: "TOPUP" }]);
    expect(a.direction).toBe("TOPUP");
    expect(b).toEqual(a);
  });

  test("a one-cent surplus raises a withdraw line — no tolerance (D-13)", () => {
    const s = settle({ need: { PLN: 50000n }, wallets: { PLN: 50001n }, walletCcys: ["PLN"] });
    expect(s.netBudgetCents).toBe(1n);
    expect(s.lines).toEqual([{ currency: "PLN", cents: 1n, direction: "WITHDRAW" }]);
  });

  test("exactly covered in every currency settles to nothing", () => {
    const s = settle({
      need: { PLN: 50000n, EUR: 1000n },
      wallets: { PLN: 50000n, EUR: 1000n },
      walletCcys: ["PLN", "EUR"],
      rates: { EURPLN: "4.3" },
    });
    expect(s.direction).toBeNull();
    expect(s.netBudgetCents).toBe(0n);
    expect(s.lines).toEqual([]);
  });

  test("states each short currency, with ≈ budget currency where it has no wallet (D-12/D-16)", () => {
    const s = settle({
      need: { PLN: 12000n, EUR: 1500n },
      wallets: { PLN: 0n },
      walletCcys: ["PLN"],
      rates: { EURPLN: "4.2667" },
    });
    expect(s.direction).toBe("TOPUP");
    expect(s.lines).toEqual([
      { currency: "PLN", cents: 12000n, direction: "TOPUP" },
      {
        currency: "EUR",
        cents: 1500n,
        direction: "TOPUP",
        equiv: { currency: "PLN", cents: 6400n },
      },
    ]);
  });

  test("a surplus partly consumes a budget-currency shortfall", () => {
    const s = settle({
      need: { PLN: 10000n, EUR: 0n },
      wallets: { PLN: 0n, EUR: 1000n },
      walletCcys: ["PLN", "EUR"],
      rates: { EURPLN: "4.0", PLNEUR: "0.25" },
    });
    expect(s.netBudgetCents).toBe(-6000n);
    expect(s.lines).toEqual([{ currency: "PLN", cents: 6000n, direction: "TOPUP" }]);
  });

  test("a surplus partly consumes a foreign shortfall, keeping its ≈", () => {
    const s = settle({
      need: { EUR: 3000n },
      wallets: { PLN: 4000n },
      walletCcys: ["PLN"],
      rates: { EURPLN: "4.0", PLNEUR: "0.25" },
    });
    expect(s.netBudgetCents).toBe(-8000n);
    expect(s.lines).toEqual([
      {
        currency: "EUR",
        cents: 2000n,
        direction: "TOPUP",
        equiv: { currency: "PLN", cents: 8000n },
      },
    ]);
  });

  test("the display floor never shows a non-zero remainder as 0, and leaves the net exact", () => {
    // EUR short 1 cent ≈ −4 PLN; PLN surplus 2 → net −2 PLN; 2 PLN ≈ 0.5 EUR
    // cents → shown as 1 EUR cent, while the net stays exactly −2.
    const s = settle({
      need: { EUR: 1n },
      wallets: { PLN: 2n },
      walletCcys: ["PLN"],
      rates: { EURPLN: "4.0", PLNEUR: "0.1" },
    });
    expect(s.netBudgetCents).toBe(-2n);
    expect(s.lines).toEqual([
      { currency: "EUR", cents: 1n, direction: "TOPUP", equiv: { currency: "PLN", cents: 2n } },
    ]);
  });

  test("a currency with no rate is listed, kept on its own line, and the rest still net", () => {
    const s = settle({
      need: { PLN: 10000n, GBP: 500n },
      wallets: { PLN: 12000n },
      walletCcys: ["PLN"],
      rates: {},
    });
    expect(s.unconvertible).toEqual(["GBP"]);
    expect(s.netBudgetCents).toBe(2000n);
    expect(s.direction).toBe("WITHDRAW");
    expect(s.lines).toEqual([
      { currency: "PLN", cents: 2000n, direction: "WITHDRAW" },
      { currency: "GBP", cents: 500n, direction: "TOPUP" },
    ]);
  });

  test("lines conserve the net when nothing is partly consumed", () => {
    const s = settle({
      need: { PLN: 1000n, EUR: 1000n, USD: 1000n },
      wallets: { PLN: 0n },
      walletCcys: ["PLN"],
      rates: { EURPLN: "4.2667", USDPLN: "3.9111" },
    });
    const sum = s.lines.reduce((acc, l) => {
      const c = l.equiv ? l.equiv.cents : l.cents;
      return acc + (l.direction === "TOPUP" ? -c : c);
    }, 0n);
    expect(sum).toBe(s.netBudgetCents);
    // Wallet currencies first, then the others alphabetically.
    expect(s.lines.map((l) => l.currency)).toEqual(["PLN", "EUR", "USD"]);
  });

  test("the source carries no tolerance and no float money", async () => {
    const src = await Bun.file(
      new URL("../../src/domain/reserve-settle.ts", import.meta.url),
    ).text();
    for (const token of ["tolerance", "dead", "band", "Number(", "parseFloat"]) {
      expect(src.toLowerCase()).not.toContain(token.toLowerCase());
    }
  });
});
