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

export function computeHoldingPreview(
  i: HoldingPreviewInput,
): HoldingPreview | null {
  if (!i.behavior) return null;
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
