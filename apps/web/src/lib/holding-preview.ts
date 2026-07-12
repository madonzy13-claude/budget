/**
 * holding-preview.ts — pure sum-up math for the HoldingSheet "Preview" section.
 *
 * Renders what WILL be created, consistently across every holding type:
 *   buy total   = buyPrice × quantity        (cash: none; broker: deposited, qty 1)
 *   actual base = currentPrice × quantity     (metals: spot/oz → per-UoM × qty)
 *   premium     = actual base × premium%       (metals only)
 *   actual total= actual base + premium
 *   P/L         = actual total − buy total     (cash: none)
 *
 * The form keeps buyCurrency and currentPriceCurrency in lock-step, so the whole
 * preview is single-currency and P/L is exact (no FX needed here). Float math is
 * fine for a live PREVIEW; the persisted value/P-L is big.js-precise server-side.
 */
import {
  OZ_PER_UNIT,
  type Uom,
  type InvestmentBehavior,
} from "./investment-types";

export interface HoldingPreviewInput {
  behavior: InvestmentBehavior | null;
  currency: string;
  quantity: string;
  /** Per-unit buy price (broker: deposited total); "" = no basis (e.g. cash). */
  buyPrice: string;
  /** Per-unit current price (metals: raw spot/oz; cash: amount; broker: actual). */
  currentPrice: string;
  uom: Uom;
  /** Metals only, percent string. */
  premiumPct: string;
  // Deposit only. Principal rides `buyPrice`; these describe how it accrues so the
  // preview can project the current value (approximate float; server is exact).
  depositRatePct?: string;
  depositStart?: string;
  depositEnd?: string;
  depositFreq?: string;
}

export interface HoldingPreview {
  currency: string;
  /** Quantity is meaningful (tracked/metals) → show the "× qty" formula. */
  showQty: boolean;
  qty: number;
  buyUnit: number | null;
  buyTotal: number | null;
  /** Per-unit current price (metals: converted to UoM), before premium. */
  actualUnit: number;
  /** currentPrice × qty, before premium. */
  actualBase: number;
  premiumPct: number;
  premiumAmount: number;
  /** actualBase + premiumAmount. */
  actualTotal: number;
  pl: number | null;
  plPct: number | null;
}

function num(s: string): number {
  const v = Number(
    String(s ?? "")
      .replace(",", ".")
      .trim(),
  );
  return Number.isFinite(v) ? v : 0;
}

/**
 * Projected current value of a deposit (major units), mirroring the server's
 * computeDepositValueCents but with plain Date + float — this is a live PREVIEW,
 * the persisted value is big.js-precise server-side. Value freezes at `endISO`.
 */
export function depositPreviewValue(
  principal: number,
  ratePct: number,
  startISO: string,
  freq: string,
  endISO: string | undefined,
  nowMs: number,
): number {
  const r = ratePct / 100;
  const start = Date.parse(`${startISO}T00:00:00Z`);
  if (!Number.isFinite(start) || !r) return principal;
  let asOf = nowMs;
  const end = endISO ? Date.parse(`${endISO}T00:00:00Z`) : NaN;
  if (Number.isFinite(end) && asOf > end) asOf = end;
  if (asOf <= start) return principal;
  const DAY = 86_400_000;
  const days = (a: number, b: number) => Math.round((b - a) / DAY);
  if (freq === "daily") {
    return principal * Math.pow(1 + r / 365, days(start, asOf));
  }
  const step =
    freq === "monthly"
      ? 1
      : freq === "quarterly"
        ? 3
        : freq === "semiannual"
          ? 6
          : 12;
  let base = principal;
  let cursor = new Date(start);
  for (;;) {
    const next = new Date(cursor);
    next.setUTCMonth(next.getUTCMonth() + step);
    if (next.getTime() > asOf) break;
    base += (base * r * days(cursor.getTime(), next.getTime())) / 365;
    cursor = next;
  }
  base += (base * r * days(cursor.getTime(), asOf)) / 365;
  return base;
}

export function computeHoldingPreview(
  i: HoldingPreviewInput,
): HoldingPreview | null {
  if (!i.behavior) return null;

  // Deposit: principal + projected accrued value; P/L = accrued interest.
  if (i.behavior === "deposit") {
    const principal = num(i.buyPrice);
    const value = depositPreviewValue(
      principal,
      num(i.depositRatePct ?? ""),
      i.depositStart ?? "",
      i.depositFreq ?? "monthly",
      i.depositEnd || undefined,
      Date.now(),
    );
    return {
      currency: i.currency,
      showQty: false,
      qty: 1,
      buyUnit: principal,
      buyTotal: principal,
      actualUnit: value,
      actualBase: value,
      premiumPct: 0,
      premiumAmount: 0,
      actualTotal: value,
      pl: value - principal,
      plPct: principal !== 0 ? ((value - principal) / principal) * 100 : null,
    };
  }

  const isCash = i.behavior === "cash";
  const isBroker = i.behavior === "broker";
  const isMetals = i.behavior === "metals";
  const showQty = !isCash && !isBroker;
  const qty = showQty ? num(i.quantity || "1") : 1;

  const actualUnit = isMetals
    ? num(i.currentPrice) * (OZ_PER_UNIT[i.uom] ?? 1)
    : num(i.currentPrice);
  const actualBase = actualUnit * qty;
  const premiumPct = isMetals ? num(i.premiumPct) : 0;
  const premiumAmount = actualBase * (premiumPct / 100);
  const actualTotal = actualBase + premiumAmount;

  // Cash has no buy basis; an empty buy price (e.g. some manual holdings) means
  // "no cost basis" → no buy total + no P/L (rather than a spurious 0).
  const hasBuy = !isCash && String(i.buyPrice ?? "").trim() !== "";
  const buyUnit = hasBuy ? num(i.buyPrice) : null;
  const buyTotal = buyUnit == null ? null : buyUnit * qty;

  const pl = buyTotal == null ? null : actualTotal - buyTotal;
  const plPct =
    buyTotal != null && buyTotal !== 0
      ? ((pl as number) / buyTotal) * 100
      : null;

  return {
    currency: i.currency,
    showQty,
    qty,
    buyUnit,
    buyTotal,
    actualUnit,
    actualBase,
    premiumPct,
    premiumAmount,
    actualTotal,
    pl,
    plPct,
  };
}
