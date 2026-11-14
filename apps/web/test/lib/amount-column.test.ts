/**
 * amount-column.test.ts — how wide each investments amount column is.
 *
 * user, 261023: a group's UAH total (2 123 346,56) set the width for every row,
 * so the rows inside the group (2 600, 480, 22 000) lost room for their names.
 * Rows inside a group now line up on the group's widest row instead.
 */
import { describe, it, expect } from "vitest";
import { amountChars, amountColumnChars } from "../../src/lib/amount-column";

describe("amountColumnChars", () => {
  it("sizes a group's rows by the group's widest row, not by its total", () => {
    const cols = amountColumnChars(["2 123 346,56", "500"], {
      Flats: ["2 600", "480", "22 000"],
    });
    expect(cols.top).toBe(10.5);
    expect(cols.group.Flats).toBe(5.5);
  });

  it("never goes below four characters", () => {
    const cols = amountColumnChars(["5"], { Tiny: ["1"] });
    expect(cols.top).toBe(4);
    expect(cols.group.Tiny).toBe(4);
  });
});

// 261114: a separator is about half a digit wide, but was counted as a whole
// one — "12,345" got a 6ch column for ~5.4ch of glyphs and its currency sat
// ~14px off instead of the ~10px the user asked for (r6-ccy-gap).
describe("amountChars", () => {
  it("counts a group or decimal separator as half a character", () => {
    expect(amountChars("12,345")).toBe(5.5);
    expect(amountChars("2 123 346,56")).toBe(10.5);
    expect(amountChars("1\u202f234")).toBe(4.5);
    expect(amountChars("-200")).toBe(4);
  });
});
