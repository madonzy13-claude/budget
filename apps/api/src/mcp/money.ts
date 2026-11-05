import {
  FIAT_CURRENCIES,
  Money,
  ok,
  err,
  type Currency,
  type Result,
} from "@budget/shared-kernel";
import { MAX_TXN_CENTS } from "../routes/transactions";

/**
 * money.ts — the MCP boundary for amounts: decimal string + currency in,
 * integer minor units to the routes, and back. Never a float.
 *
 * Only the budget/category fiat list is accepted; all of it has 2 decimals.
 */
const DECIMAL_RE = /^-?\d+(\.\d+)?$/;
const SUPPORTED: ReadonlySet<string> = new Set(FIAT_CURRENCIES);

export function toMinorUnits(
  amount: string,
  currency: string,
): Result<number, string> {
  if (!DECIMAL_RE.test(amount)) return err("invalid_amount");
  const ccy = currency.toUpperCase();
  if (!SUPPORTED.has(ccy)) return err("unsupported_currency");
  if ((amount.split(".")[1]?.length ?? 0) > 2) return err("too_many_decimals");
  const cents = Money.of(amount, ccy as Currency).amount.times(100);
  if (cents.abs().gt(MAX_TXN_CENTS)) return err("amount_out_of_range");
  return ok(cents.toNumber());
}

export function fromMinorUnits(cents: number | string, currency: string): string {
  return Money.of(cents, currency.toUpperCase() as Currency)
    .amount.div(100)
    .toFixed(2);
}
