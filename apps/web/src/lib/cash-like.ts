/**
 * cash-like.ts — cash and stablecoins are money, not investments: no
 * "realized" on them (13.1 round 6, user).
 */
import { stablePeg } from "./stablecoins";

// Manual tickers; catalog coins come from STABLECOIN_PEG (a holding's symbol
// is the CoinGecko id there).
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
    STABLECOINS.has((h.symbol ?? "").toUpperCase()) ||
    stablePeg(h.symbol) !== null
  );
}
