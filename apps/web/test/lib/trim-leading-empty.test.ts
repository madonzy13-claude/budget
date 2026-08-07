/**
 * trim-leading-empty.test.ts — where the "All" range starts (260803).
 *
 * "All" asks for five years back, so a budget with two years of history opens on
 * a long empty run. Those leading rows are dropped so the chart starts at the
 * first thing that happened. It has broken twice: once because the key list
 * named a field the rows do not carry (`Number(undefined)` is NaN, and NaN !== 0
 * kept every row), and once because a bug drew a plan across months that had
 * none. Both were invisible until someone opened the tab.
 */
import { describe, it, expect } from "vitest";
import { trimLeadingEmpty } from "../../src/lib/trim-leading-empty";

const row = (real: number, needs = 0, wants = 0) => ({ real, needs, wants });

describe("trimLeadingEmpty", () => {
  it("starts at the first row that has something in it", () => {
    const rows = [row(0), row(0), row(500), row(700)];
    expect(trimLeadingEmpty(rows, ["real", "needs", "wants"])).toEqual([
      row(500),
      row(700),
    ]);
  });

  it("counts a PLAN as something — history is not only spending", () => {
    const rows = [row(0), row(0, 200, 50), row(500, 200, 50)];
    expect(trimLeadingEmpty(rows, ["real", "needs", "wants"])).toHaveLength(2);
  });

  it("keeps everything when the first row already has something", () => {
    const rows = [row(500), row(0), row(700)];
    expect(trimLeadingEmpty(rows, ["real"])).toEqual(rows);
  });

  it("drops nothing when every row is empty, rather than emptying the chart", () => {
    const rows = [row(0), row(0)];
    expect(trimLeadingEmpty(rows, ["real"])).toEqual(rows);
  });

  it("ignores a key the rows do not carry instead of keeping every row", () => {
    // The regression: `Number(undefined)` is NaN and NaN !== 0, so naming a
    // missing key made every row look non-empty and nothing was ever trimmed.
    const rows = [row(0), row(0), row(500)];
    expect(trimLeadingEmpty(rows, ["real", "reserve"])).toEqual([row(500)]);
  });

  it("is a no-op when asked to look at no keys at all", () => {
    const rows = [row(0), row(500)];
    expect(trimLeadingEmpty(rows, [])).toEqual(rows);
  });
});
