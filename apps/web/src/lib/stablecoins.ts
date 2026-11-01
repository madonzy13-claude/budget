/**
 * stablecoins.ts — catalog stablecoins and the fiat each one tracks (13.1
 * round 6, user): picking one fills buy price 1 in that currency, locked, and
 * it reads as cash (no "realized").
 *
 * Generated 2026-10-31 from CoinGecko's usd/eur/gbp/chf-stablecoin categories
 * ∩ budgeting.instruments (crypto), keeping coins within 2% of their peg —
 * yield-bearing and depegged ones (USDY-style, LUSD, USTC…) are left out. Only
 * currencies the app's picker offers are mapped.
 */
// ponytail: static list; regenerate when the instrument catalog grows.
export const STABLECOIN_PEG: Readonly<Record<string, string>> = {
  "aegis-yusd": "USD", // YUSD
  "agora-dollar": "USD", // AUSD
  "allunity-chf": "CHF", // CHFAU
  apxusd: "USD", // APXUSD
  "binance-usd": "USD", // BUSD
  "cap-usd": "USD", // CUSD
  "cash-4": "USD", // CASH
  "celo-dollar": "USD", // USDM
  crvusd: "USD", // CRVUSD
  dai: "USD", // DAI
  "dola-usd": "USD", // DOLA
  "electronic-usd": "USD", // EUSD
  "esui-dollar": "USD", // SUIUSDE
  "ethena-usde": "USD", // USDE
  eurite: "EUR", // EURI
  "euro-coin": "EUR", // EURC
  "f-x-protocol-fxusd": "USD", // FXUSD
  "falcon-finance": "USD", // USDF
  "fidelity-digital-dollar": "USD", // FIDD
  "first-digital-usd": "USD", // FDUSD
  frankencoin: "CHF", // ZCHF
  frax: "USD", // FRAX
  "frax-usd": "USD", // FRXUSD
  "gemini-dollar": "USD", // GUSD
  gho: "USD", // GHO
  "global-dollar": "USD", // USDG
  gusd: "USD", // GUSD
  "hylo-usd": "USD", // HYUSD
  jupusd: "USD", // JUPUSD
  "liquity-bold-2": "USD", // BOLD
  "metamask-usd": "USD", // MUSD
  "mezo-usd": "USD", // MUSD
  "monerium-eur-money": "EUR", // EURE
  "monerium-eur-money-2": "EUR", // EURE
  "ondo-u-s-dollar-token": "USD", // USDON
  "open-usd": "USD", // OUSD
  "openeden-open-dollar": "USD", // USDO
  pathusd: "USD", // PATHUSD
  "paxos-standard": "USD", // USDP
  "paypal-usd": "USD", // PYUSD
  "ripple-usd": "USD", // RLUSD
  "satoshi-stablecoin": "USD", // SATUSD
  "saturn-dollar": "USD", // USDAT
  "schuman-europ": "EUR", // EUROP
  "societe-generale-forge-eurcv": "EUR", // EURCV
  sofiusd: "USD", // SOFID
  "standx-dusd": "USD", // DUSD
  tether: "USD", // USDT
  "tokenised-gbp": "GBP", // TGBP
  "tori-trusd": "USD", // TRUSD
  "true-usd": "USD", // TUSD
  "united-stables": "USD", // U
  "universal-usd": "USD", // USDU
  usa: "USD", // USAT
  "usd-coin": "USD", // USDC
  "usd-coinvertible": "USD", // USDCV
  "usd1-wlfi": "USD", // USD1
  usdd: "USD", // USDD
  usdgo: "USD", // USDGO
  "usdh-2": "USD", // USDH
  usdkg: "USD", // USDKG
  usds: "USD", // USDS
  usdsui: "USD", // USDSUI
  usdtb: "USD", // USDTB
  "usual-usd": "USD", // USD0
  usx: "USD", // USX
  xdai: "USD", // XDAI
  ylds: "USD", // YLDS
  "zedxion-usdz": "USD", // USDZ
};

/** The fiat a stablecoin tracks (by catalog id, i.e. the holding's symbol),
 *  or null. */
export function stablePeg(symbol: string | null | undefined): string | null {
  return (symbol && STABLECOIN_PEG[symbol]) || null;
}
