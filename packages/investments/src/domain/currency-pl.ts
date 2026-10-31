/**
 * currency-pl.ts — R6 (user): an asset's P/L in a chosen currency, replayed
 * from its ledger with every entry converted at ITS OWN date's rate. Today's
 * rate never touches what was paid or received — only today's value.
 *
 * Cost is tracked twice: in the asset's own cost currency (the ledger's
 * cost_delta, which says what fraction a sale took) and in the chosen
 * currency (what that cost was worth when it was paid). A sale takes the same
 * fraction of both; its realized = proceeds at the sale's rate − that share.
 */
import { big, cents } from "./sell-booking";

export interface ReplayEntry {
  kind: string;
  effectiveDate: string;
  /** The deal amount (paid / received), in amountCurrency. */
  amountCents: bigint | null;
  amountCurrency: string | null;
  /** Cost basis added (> 0) or taken (< 0), in costCurrency. */
  costDeltaCents: bigint;
  costCurrency: string | null;
  counterpartyHoldingId: string | null;
}

/** 1 unit of `ccy` in the chosen currency, on `date`. */
export type RateAt = (ccy: string, date: string) => number;

export interface ReplayResult {
  /** Cost still held, chosen currency. */
  costCents: bigint;
  realizedCents: bigint;
  /** Money put in from outside (`internal` legs excluded). */
  contributedCents: bigint;
}

/** `entries` oldest first. `internal` marks legs whose other side is in the
 *  same group (a swap inside it moves money already in it). */
export function replayInCurrency(
  entries: ReplayEntry[],
  rateAt: RateAt,
  internal: (e: ReplayEntry) => boolean = () => false,
): ReplayResult {
  let held = big(0n); // cost currency
  let costX = big(0n);
  let realized = big(0n);
  let contributed = big(0n);
  for (const e of entries) {
    const cd = e.costDeltaCents;
    if (cd === 0n) continue; // market moves, interest: no money changed hands
    const amount =
      e.amountCents != null && e.amountCurrency
        ? { cents: e.amountCents, ccy: e.amountCurrency }
        : { cents: cd < 0n ? -cd : cd, ccy: e.costCurrency ?? "" };
    const amountX = big(amount.cents < 0n ? -amount.cents : amount.cents).times(
      rateAt(amount.ccy, e.effectiveDate),
    );
    if (cd > 0n) {
      held = held.plus(big(cd));
      costX = costX.plus(amountX);
      if (!internal(e) && e.kind !== "transfer_in")
        contributed = contributed.plus(amountX);
      continue;
    }
    const share = held.gt(0) ? big(-cd).div(held) : big(1n);
    const sold = costX.times(share.gt(1) ? 1 : share);
    costX = costX.minus(sold);
    held = held.plus(big(cd));
    // A transfer moves cost between two of the user's assets — no gain.
    if (e.kind !== "transfer_out")
      realized = realized.plus(amountX.minus(sold));
  }
  return {
    costCents: cents(costX),
    realizedCents: cents(realized),
    contributedCents: cents(contributed),
  };
}
