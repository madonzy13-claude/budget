export type Currency = string & { __brand: "Currency" };

const FIAT_RE = /^[A-Z]{3}$/;
const CRYPTO = new Set(["BTC", "ETH", "USDT", "USDC", "BNB", "SOL"]);

export function asCurrency(code: string): Currency {
  const c = code.toUpperCase();
  if (!FIAT_RE.test(c) && !CRYPTO.has(c))
    throw new Error(`Invalid currency code: ${code}`);
  return c as Currency;
}

export function isCrypto(c: Currency): boolean {
  return CRYPTO.has(c);
}
export function isFiat(c: Currency): boolean {
  return !CRYPTO.has(c) && FIAT_RE.test(c);
}
