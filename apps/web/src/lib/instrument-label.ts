/**
 * instrument-label.ts — derive the ticker + full name for a holding so tracked
 * instruments (stock + crypto) can render "TICKER (Name)" on desktop and the
 * ticker (tap → full name) on mobile.
 *
 * Data quirks:
 *  - equity/etf/etb/reit: instrument `symbol` IS the ticker (AAPL, VOO).
 *  - crypto: `symbol` is the CoinGecko slug ("bitcoin"); the real ticker (BTC)
 *    is carried in the display name as "Bitcoin (BTC)".
 *  - custom / cash / metals: no `symbol` → no ticker, name as-is.
 */
export interface InstrumentLabelInput {
  symbol: string | null;
  name: string;
  holdingType: string;
}

export interface InstrumentLabel {
  /** Ticker to show, or null when the holding isn't a tracked instrument. */
  ticker: string | null;
  /** Full instrument name (no ticker). */
  full: string;
}

export function instrumentLabel(h: InstrumentLabelInput): InstrumentLabel {
  if (!h.symbol) return { ticker: null, full: h.name };

  // Precious metals are priced off a spot pair (XAU/USD) — that's not a user-facing
  // ticker, so show the holding's own name ("Gold coins") instead.
  if (h.holdingType === "commodity") return { ticker: null, full: h.name };

  if (h.holdingType === "crypto") {
    const m = h.name.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
    if (m) return { ticker: m[2], full: m[1] };
    return { ticker: h.symbol.toUpperCase(), full: h.name };
  }

  return { ticker: h.symbol, full: h.name };
}

/** Desktop label: "TICKER (Name)" for tracked instruments, else the name. */
export function desktopLabel(h: InstrumentLabelInput): string {
  const { ticker, full } = instrumentLabel(h);
  return ticker ? `${ticker} (${full})` : full;
}

/** Mobile label: ticker when collapsed, full name when expanded (tapped). */
export function mobileLabel(
  h: InstrumentLabelInput,
  expanded: boolean,
): string {
  const { ticker, full } = instrumentLabel(h);
  if (!ticker) return full;
  return expanded ? full : ticker;
}
