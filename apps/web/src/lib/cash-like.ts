/**
 * cash-like.ts — cash and stablecoins are money, not investments: no
 * "realized" on them (13.1 round 6, user).
 */
// ponytail: the common fiat-pegged coins; extend when a new one shows up.
const STABLECOINS = new Set([
  "USDT",
  "USDC",
  "DAI",
  "BUSD",
  "TUSD",
  "USDP",
  "FDUSD",
  "PYUSD",
  "USDE",
  "EURC",
  "EURT",
]);

export function isCashLike(h: {
  holdingType?: string | null;
  uiType?: string | null;
  symbol?: string | null;
}): boolean {
  return (
    h.holdingType === "cash_fx" ||
    h.uiType === "cash" ||
    STABLECOINS.has((h.symbol ?? "").toUpperCase())
  );
}
