/**
 * cap-buckets.test.ts — the "where your money is" pie must account for every
 * pool of money, or a wallet type silently disappears from the chart while
 * still counting toward the capitalization figure above it.
 */
import { describe, it, expect } from "vitest";
import { capitalizationBuckets } from "../../src/lib/cap-buckets";

const cards = {
  investment_value_cents: "1000",
  possessions_value_cents: "2000",
  other_value_cents: "3000",
  spendings: { wallet_cents: "4000" },
  reserves: { wallet_cents: "5000" },
  cushion: { total_cents: "6000" },
};

const label = (key: string) => key;

describe("capitalizationBuckets", () => {
  it("gives every pool of money its own slice", () => {
    const buckets = capitalizationBuckets(cards, label);
    expect(buckets.map((b) => [b.name, b.value])).toEqual([
      ["wealth.capInvestments", 1000],
      ["wealth.capSpendings", 4000],
      ["wealth.capReserves", 5000],
      ["wealth.capCushion", 6000],
      ["wealth.capPossessions", 2000],
      ["wealth.capOther", 3000],
    ]);
  });

  it("gives each slice a colour of its own", () => {
    const colors = capitalizationBuckets(cards, label).map((b) => b.color);
    expect(new Set(colors).size).toBe(colors.length);
  });

  it("drops empty pools", () => {
    const buckets = capitalizationBuckets(
      { ...cards, other_value_cents: "0", possessions_value_cents: "0" },
      label,
    );
    expect(buckets.map((b) => b.name)).not.toContain("wealth.capOther");
    expect(buckets.map((b) => b.name)).not.toContain("wealth.capPossessions");
  });

  it("survives a cached payload from before other_value_cents existed", () => {
    // The persisted query cache replays the previous deploy's DTO shape.
    const old = { ...cards } as Partial<typeof cards>;
    delete old.other_value_cents;
    expect(() => capitalizationBuckets(old, label)).not.toThrow();
    expect(capitalizationBuckets(old, label).map((b) => b.name)).not.toContain(
      "wealth.capOther",
    );
  });
});
