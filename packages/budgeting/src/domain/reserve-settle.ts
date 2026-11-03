/**
 * reserve-settle.ts — settle the per-currency reserve need against the
 * per-currency RESERVE wallet balances (Phase 14). Pure: bigint cents in and
 * out, the only rounding goes through convertCents (half away from zero).
 *
 * Rules (decided with the user, 2026-11-03):
 *   - D-11 own currency first: d[c] = wallets[c] − need[c], FX-free, so an FX
 *     move never touches a currency its own wallets cover.
 *   - D-15 net across currencies: each d[c] converts to the budget currency at
 *     today's rate and the signed sum is the net. A surplus in one currency
 *     covers a shortfall in another; only the net can raise a top-up/withdraw.
 *   - D-13 exact: the net is compared with 0n, nothing else (as `surplus ===
 *     0n` was before multi-currency). Every cent of a remainder counts.
 *   - D-16: a line in a currency with no RESERVE wallet of its own carries an
 *     "≈" equivalent in the budget currency.
 *
 * Consumption: the side opposite the net's sign is used up entirely; it is
 * taken from the same-sign lines in order budget currency first, then the
 * other currencies alphabetically. A fully consumed line drops; a partly
 * consumed one keeps its remainder.
 *
 * A currency with no rate to the budget currency is never converted at par:
 * it is listed in `unconvertible`, kept on its own line, and left out of the
 * net — the rest still settles.
 */
import Big from "big.js";
import { convertCents } from "./fx-round";

export type ReserveDirection = "TOPUP" | "WITHDRAW";

export type ReserveSettlementLine = {
  currency: string;
  /** Always > 0; the sign lives in `direction`. */
  cents: bigint;
  direction: ReserveDirection;
  /** D-16: the same amount in the budget currency, when `currency` has no RESERVE wallet. */
  equiv?: { currency: string; cents: bigint };
};

export type ReserveSettlement = {
  /** Signed, budget currency: > 0 surplus, < 0 shortfall. Exact. */
  netBudgetCents: bigint;
  direction: ReserveDirection | null;
  lines: ReserveSettlementLine[];
  unconvertible: string[];
};

export type SettleReserveInput = {
  /** Σ category reserve per category currency. */
  needByCurrency: Map<string, bigint>;
  /** Σ RESERVE wallet balance per wallet currency. */
  walletsByCurrency: Map<string, bigint>;
  /** Currencies that HAVE a RESERVE wallet, even at a 0 balance. */
  reserveWalletCurrencies: Set<string>;
  budgetCurrency: string;
  /** Today's rate; null = no rate for the pair. */
  rate: (from: string, to: string) => string | null;
};

const abs = (x: bigint) => (x < 0n ? -x : x);
const dirOf = (x: bigint): ReserveDirection => (x < 0n ? "TOPUP" : "WITHDRAW");

export function settleReserveByCurrency(input: SettleReserveInput): ReserveSettlement {
  const { needByCurrency: need, walletsByCurrency: wallets, budgetCurrency: budget, rate } = input;
  const hasWallet = input.reserveWalletCurrencies;

  const currencies = [...new Set([...need.keys(), ...wallets.keys()])];
  const unconvertible: string[] = [];
  const lines: ReserveSettlementLine[] = [];
  const legs: { currency: string; d: bigint; b: bigint; rate: string | null }[] = [];

  for (const currency of currencies) {
    const d = (wallets.get(currency) ?? 0n) - (need.get(currency) ?? 0n);
    if (currency === budget) {
      legs.push({ currency, d, b: d, rate: null });
      continue;
    }
    const r = rate(currency, budget);
    if (r === null) {
      unconvertible.push(currency);
      if (d !== 0n) lines.push({ currency, cents: abs(d), direction: dirOf(d) });
      continue;
    }
    legs.push({ currency, d, b: convertCents(d, r), rate: r });
  }

  const netBudgetCents = legs.reduce((s, l) => s + l.b, 0n);
  const direction = netBudgetCents === 0n ? null : dirOf(netBudgetCents);

  if (direction !== null) {
    const sign = netBudgetCents < 0n ? -1n : 1n;
    let toConsume = abs(legs.filter((l) => l.b * sign < 0n).reduce((s, l) => s + l.b, 0n));
    const sameSide = legs
      .filter((l) => l.b * sign > 0n)
      .sort((x, y) =>
        x.currency === budget ? -1 : y.currency === budget ? 1 : x.currency.localeCompare(y.currency),
      );

    for (const leg of sameSide) {
      const full = abs(leg.b);
      const taken = full < toConsume ? full : toConsume;
      toConsume -= taken;
      const remainder = full - taken;
      if (remainder === 0n) continue;

      let cents: bigint;
      if (leg.currency === budget) cents = remainder;
      else if (taken === 0n) cents = abs(leg.d);
      else {
        // Display only: a non-zero remainder never reads as 0 in its own
        // currency. The net and the task trigger above stay exact (D-13).
        const own = backToOwn(remainder, budget, leg.currency, leg.rate!, rate);
        cents = own < 1n ? 1n : own;
      }

      const line: ReserveSettlementLine = { currency: leg.currency, cents, direction };
      if (leg.currency !== budget && !hasWallet.has(leg.currency)) {
        line.equiv = { currency: budget, cents: remainder };
      }
      lines.push(line);
    }
  }

  lines.sort((x, y) => {
    const wx = hasWallet.has(x.currency) ? 0 : 1;
    const wy = hasWallet.has(y.currency) ? 0 : 1;
    return wx !== wy ? wx - wy : x.currency.localeCompare(y.currency);
  });
  unconvertible.sort();

  return { netBudgetCents, direction, lines, unconvertible };
}

/** Budget-currency cents back to `currency`: today's reverse rate, else ÷ the forward rate. */
function backToOwn(
  budgetCents: bigint,
  budget: string,
  currency: string,
  forwardRate: string,
  rate: SettleReserveInput["rate"],
): bigint {
  const reverse = rate(budget, currency);
  if (reverse !== null) return abs(convertCents(budgetCents, reverse));
  return abs(
    BigInt(new Big(budgetCents.toString()).div(forwardRate).round(0, Big.roundHalfUp).toFixed(0)),
  );
}
