/**
 * Contributions from history (D-08 / D-19).
 *
 * Contributions at date D = Σ external flows dated on/before D, each converted
 * to budget currency at the rate AS OF D (not the flow's own date), so FX-only
 * moves cancel out of the "without contributions" line. Conversion legs carry
 * flow 0 and never move it.
 *
 * A missing historic rate resolves `null` for that date instead of throwing —
 * the Overview then falls back to the stored snapshot cost for that point.
 */
import Big from "big.js";

export interface FlowEntry {
  effectiveDate: string; // YYYY-MM-DD
  flowCents: bigint;
  flowCurrency: string;
}

export interface ContributionsReader {
  firstDate: string | null;
  at(date: string): Promise<bigint | null>;
}

export function makeContributionsReader(
  entries: FlowEntry[],
  budgetCurrency: string,
  rateFor: (fromCcy: string, toCcy: string, date: string) => Promise<string>,
): ContributionsReader {
  const firstDate = entries.reduce<string | null>(
    (min, e) => (min === null || e.effectiveDate < min ? e.effectiveDate : min),
    null,
  );
  const rates = new Map<string, Promise<string | null>>();
  const rate = (ccy: string, date: string): Promise<string | null> => {
    if (ccy === budgetCurrency) return Promise.resolve("1");
    const key = `${ccy}|${date}`;
    let p = rates.get(key);
    if (!p) {
      p = rateFor(ccy, budgetCurrency, date).catch(() => null);
      rates.set(key, p);
    }
    return p;
  };

  return {
    firstDate,
    async at(date) {
      let sum = new Big(0);
      for (const e of entries) {
        if (e.effectiveDate > date) continue;
        const r = await rate(e.flowCurrency, date);
        if (r === null) return null;
        sum = sum.plus(new Big(e.flowCents.toString()).times(r).round(0, 2));
      }
      return BigInt(sum.toFixed(0));
    },
  };
}
