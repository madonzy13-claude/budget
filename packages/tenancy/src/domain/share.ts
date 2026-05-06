import Big from "big.js";
import { ok, err, type Result } from "@budget/shared-kernel";

export interface ShareEntry {
  userId: string;
  percentage: string;
}

export function validateShares(entries: ShareEntry[]): Result<void, Error> {
  if (entries.length === 0)
    return err(new Error("At least one share required"));
  let sum = new Big(0);
  for (const e of entries) {
    const p = new Big(e.percentage);
    if (p.lt(0) || p.gt(100))
      return err(
        new Error(
          `Share for ${e.userId} out of range [0,100]: ${e.percentage}`,
        ),
      );
    sum = sum.plus(p);
  }
  // UI-SPEC tolerance ±0.005 — domain accepts ±0.01 to be lenient on rounding
  if (sum.minus(100).abs().gt("0.01")) {
    return err(new Error(`Shares must sum to 100; got ${sum.toString()}`));
  }
  return ok(undefined);
}
