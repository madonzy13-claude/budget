import Big from "big.js";
import { ok, err, type Result } from "@budget/shared-kernel";

export interface ShareEntry {
  userId: string;
  percentage: string;
}

/**
 * Validates that share entries sum to 100% within ±0.005 tolerance.
 * Intentionally duplicated from packages/tenancy/src/domain/share.ts per D-02:
 * BDGT-08 (per-category) and TENT-13 (global) are separate domains — no coupling.
 */
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
  // RESEARCH.md §10: tolerance ±0.005 (stricter than tenancy's ±0.01)
  if (sum.minus(100).abs().gt("0.005")) {
    return err(new Error(`Shares must sum to 100; got ${sum.toString()}`));
  }
  return ok(undefined);
}
