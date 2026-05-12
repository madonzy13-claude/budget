/**
 * fx-provider.ts — Deterministic FxProvider stub for integration tests.
 * Returns fixed rates by (from, to, date) key so tests are reproducible.
 */
import type { FxProvider } from "@budget/shared-kernel/src/ports/fx-provider";

type RateKey = string; // `${from}->${to}@${date}` or `${from}->${to}` fallback

const RATE_TABLE: Record<RateKey, string> = {
  // USD → EUR on 2026-05-11
  "USD->EUR@2026-05-11": "0.84",
  // GBP → EUR on 2026-05-11
  "GBP->EUR@2026-05-11": "1.10",
  // USD → EUR on 2026-04-01
  "USD->EUR@2026-04-01": "0.80",
  // USD → EUR (generic fallback)
  "USD->EUR": "0.84",
  // GBP → EUR (generic fallback)
  "GBP->EUR": "1.10",
};

export class StubFxProvider implements FxProvider {
  async rateAsOf(
    from: string,
    to: string,
    date: Date,
  ): Promise<{ rate: string; provider: string; isStale: boolean }> {
    if (from === to) {
      return { rate: "1", provider: "stub", isStale: false };
    }
    const dateStr = date.toISOString().slice(0, 10);
    const specificKey: RateKey = `${from}->${to}@${dateStr}`;
    const genericKey: RateKey = `${from}->${to}`;

    const rate = RATE_TABLE[specificKey] ?? RATE_TABLE[genericKey] ?? "1";
    return { rate, provider: "stub", isStale: false };
  }
}
