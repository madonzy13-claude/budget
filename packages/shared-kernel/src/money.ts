import Big from 'big.js';

export type FiatCurrency = 'USD' | 'EUR' | 'PLN' | 'GBP' | 'UAH' | 'CHF' | 'NOK' | 'SEK';
export type CryptoCurrency = 'BTC' | 'ETH';
export type Currency = FiatCurrency | CryptoCurrency;

const CRYPTO_CURRENCIES: ReadonlySet<string> = new Set(['BTC', 'ETH']);
const FIAT_SCALE = 4;
const CRYPTO_SCALE = 18;

// Use banker's rounding (ROUND_HALF_EVEN = 2) for fiat
Big.RM = 2 as typeof Big.RM;

export class Money {
  readonly amount: Big;
  readonly currency: Currency;

  private constructor(amount: Big, currency: Currency) {
    this.amount = amount;
    this.currency = currency;
  }

  static of(amount: string | number, currency: Currency): Money {
    // Always parse via string to avoid float imprecision
    return new Money(new Big(String(amount)), currency);
  }

  static fromDb(amount_str: string, currency: Currency): Money {
    return new Money(new Big(amount_str), currency);
  }

  isCrypto(): boolean {
    return CRYPTO_CURRENCIES.has(this.currency);
  }

  add(other: Money): Money {
    if (this.currency !== other.currency) {
      throw new Error(
        `Cannot add Money values in different currencies — convert first (${this.currency} vs ${other.currency})`
      );
    }
    return new Money(this.amount.plus(other.amount), this.currency);
  }

  sub(other: Money): Money {
    if (this.currency !== other.currency) {
      throw new Error(
        `Cannot subtract Money values in different currencies — convert first (${this.currency} vs ${other.currency})`
      );
    }
    return new Money(this.amount.minus(other.amount), this.currency);
  }

  mul(factor: string | number): Money {
    return new Money(this.amount.times(new Big(String(factor))), this.currency);
  }

  equals(other: Money): boolean {
    if (this.currency !== other.currency) return false;
    return this.amount.eq(other.amount);
  }

  toDb(): { amount_str: string; currency: Currency } {
    const scale = this.isCrypto() ? CRYPTO_SCALE : FIAT_SCALE;
    // toFixed applies rounding; for stored precision we need exact string
    // Use toFixed only if the amount has more decimals than allowed scale
    const str = this.amount.toFixed(scale);
    // Remove trailing zeros beyond actual precision to preserve exact values
    // but keep minimum required scale representation
    return { amount_str: str, currency: this.currency };
  }

  toString(): string {
    const scale = this.isCrypto() ? CRYPTO_SCALE : FIAT_SCALE;
    return `${this.amount.toFixed(scale)} ${this.currency}`;
  }
}
