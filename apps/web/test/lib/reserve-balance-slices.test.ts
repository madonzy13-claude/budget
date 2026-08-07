/**
 * reserve-balance-slices.test.ts — what the "Reserve balance, by category" pie
 * draws (260804: it was a bar chart, and it drew every category including the
 * ones holding nothing).
 */
import { describe, it, expect } from "vitest";
import { reserveBalanceSlices } from "../../src/lib/reserve-balance-slices";

const row = (name: string, cents: string) => ({
  category_id: `id-${name}`,
  name,
  reserve_cents: cents,
});

describe("reserveBalanceSlices", () => {
  it("drops the categories holding nothing", () => {
    const slices = reserveBalanceSlices([
      row("Food", "5000"),
      row("Empty", "0"),
    ]);
    expect(slices.map((s) => s.name)).toEqual(["Food"]);
  });

  it("puts the biggest holding first", () => {
    const slices = reserveBalanceSlices([
      row("Small", "100"),
      row("Big", "90000"),
      row("Mid", "5000"),
    ]);
    expect(slices.map((s) => s.name)).toEqual(["Big", "Mid", "Small"]);
  });

  it("keeps each slice's category id, for its colour", () => {
    expect(reserveBalanceSlices([row("Food", "5000")])[0]).toEqual({
      name: "Food",
      category_id: "id-Food",
      reserve: 5000,
    });
  });

  it("has nothing to draw when every reserve is empty", () => {
    expect(reserveBalanceSlices([row("A", "0"), row("B", "0")])).toEqual([]);
  });
});
