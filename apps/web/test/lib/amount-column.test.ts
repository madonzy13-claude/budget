/**
 * amount-column.test.ts — how wide each investments amount column is.
 *
 * user, 261023: a group's UAH total (2 123 346,56) set the width for every row,
 * so the rows inside the group (2 600, 480, 22 000) lost room for their names.
 * Rows inside a group now line up on the group's widest row instead.
 */
import { describe, it, expect } from "vitest";
import { amountColumnChars } from "../../src/lib/amount-column";

describe("amountColumnChars", () => {
  it("sizes a group's rows by the group's widest row, not by its total", () => {
    const cols = amountColumnChars(["2 123 346,56", "500"], {
      Flats: ["2 600", "480", "22 000"],
    });
    expect(cols.top).toBe(12);
    expect(cols.group.Flats).toBe(6);
  });

  it("never goes below four characters", () => {
    const cols = amountColumnChars(["5"], { Tiny: ["1"] });
    expect(cols.top).toBe(4);
    expect(cols.group.Tiny).toBe(4);
  });
});
