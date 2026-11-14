/**
 * convert-to-category-currency.ts — Phase 14 (user, 261103): screens that work
 * in the BUDGET currency (the Overview rebalance dialogs) send amounts with the
 * currency they are in; a category stores its limit and reserve in its OWN
 * currency, so the amount converts here at today's rate.
 */
import { FIAT_CURRENCIES, serverNow, type Currency } from "@budget/shared-kernel";
import { convertCents } from "@budget/budgeting/src/domain/fx-round";

type Deps = {
  findCategoryById: (i: { tenantId: string; categoryId: string }) => Promise<{
    isErr(): boolean;
    value?: { currency?: string } | null;
  }>;
  fxProvider: {
    rateAsOf(from: Currency, to: Currency, date: Date): Promise<{ rate: string }>;
  };
};

/** A converter from `from` into the category's currency (identity when equal), or why not. */
export async function categoryCurrencyConverter(
  deps: Deps,
  tenantId: string,
  categoryId: string,
  from: unknown,
): Promise<
  | {
      ok: true;
      currency: string | null;
      convert: (cents: string) => string;
      /** Back from the category's currency into the caller's (for a reply). */
      back: (cents: string) => string;
    }
  | { ok: false; error: "not_found" | "invalid_currency" | "fx_rate_unavailable" }
> {
  const same = (c: string) => c;
  if (from === undefined) return { ok: true, currency: null, convert: same, back: same };
  if (typeof from !== "string" || !(FIAT_CURRENCIES as readonly string[]).includes(from)) {
    return { ok: false, error: "invalid_currency" };
  }
  const cat = await deps.findCategoryById({ tenantId, categoryId });
  if (cat.isErr() || !cat.value?.currency) return { ok: false, error: "not_found" };
  const to = cat.value.currency;
  if (to === from) return { ok: true, currency: to, convert: same, back: same };
  try {
    // The server clock (review WR-08) — the gated test clock lives there.
    const now = serverNow();
    const { rate } = await deps.fxProvider.rateAsOf(from as Currency, to as Currency, now);
    const { rate: backRate } = await deps.fxProvider.rateAsOf(to as Currency, from as Currency, now);
    return {
      ok: true,
      currency: to,
      convert: (c) => convertCents(BigInt(c), rate).toString(),
      back: (c) => convertCents(BigInt(c), backRate).toString(),
    };
  } catch {
    return { ok: false, error: "fx_rate_unavailable" };
  }
}
