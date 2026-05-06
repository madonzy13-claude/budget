import type { Currency } from '../money';

export interface FxProvider {
  rateAsOf(
    from: Currency,
    to: Currency,
    date: Date
  ): Promise<{ rate: string; provider: string; isStale: boolean }>;
}

export class InMemoryFxProvider implements FxProvider {
  constructor(private readonly fixed: Record<string, string> = {}) {}

  async rateAsOf(
    from: Currency,
    to: Currency,
    _date: Date
  ): Promise<{ rate: string; provider: string; isStale: boolean }> {
    if (from === to) {
      return { rate: '1', provider: 'in-memory', isStale: false };
    }
    const key = `${from}->${to}`;
    return {
      rate: this.fixed[key] ?? '1',
      provider: 'in-memory',
      isStale: false,
    };
  }
}
