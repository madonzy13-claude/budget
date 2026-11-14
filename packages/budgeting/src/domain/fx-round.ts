/**
 * fx-round.ts — convert integer cents at a decimal rate, the TS twin of SQL
 * budgeting.fx_convert's round(): half away from zero, so a refund mirrors a
 * payment. The rounding mode is passed explicitly — money.ts sets the GLOBAL
 * Big.RM to half-even, which must not leak into conversions.
 */
import Big from "big.js";

export const convertCents = (cents: bigint, rate: string): bigint =>
  BigInt(new Big(cents.toString()).times(rate).round(0, Big.roundHalfUp).toFixed(0));
