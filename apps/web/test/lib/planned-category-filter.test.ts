/**
 * planned-category-filter.test.ts — the timeline's category multi-select (260802).
 *
 * Picking every category — or none at all — is the same as not filtering, so the
 * chart asks for everything. The choice is remembered per budget on the device,
 * and never carries an id the budget no longer has.
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  effectiveCategoryIds,
  loadPlannedCategories,
  prunePlannedCategories,
  savePlannedCategories,
} from "../../src/lib/planned-category-filter";

const ALL = ["a", "b", "c"];

describe("effectiveCategoryIds", () => {
  it("asks for nothing in particular when every category is picked", () => {
    expect(effectiveCategoryIds(["a", "b", "c"], ALL)).toBeUndefined();
  });

  it("asks for nothing in particular when the picker is empty", () => {
    // Closing the picker with nothing ticked reads as "show me everything",
    // not as an empty chart (user decision).
    expect(effectiveCategoryIds([], ALL)).toBeUndefined();
  });

  it("passes a strict subset through", () => {
    expect(effectiveCategoryIds(["a", "c"], ALL)).toEqual(["a", "c"]);
  });

  it("ignores ids the budget no longer has when deciding 'all'", () => {
    expect(effectiveCategoryIds(["a", "b", "c", "gone"], ALL)).toBeUndefined();
  });
});

describe("prunePlannedCategories", () => {
  it("drops ids that are no longer categories", () => {
    expect(prunePlannedCategories(["a", "gone", "c"], ALL)).toEqual(["a", "c"]);
  });

  it("keeps the order the categories are listed in", () => {
    expect(prunePlannedCategories(["c", "a"], ALL)).toEqual(["a", "c"]);
  });
});

describe("remembering the choice", () => {
  beforeEach(() => localStorage.clear());

  it("survives a round trip, per budget", () => {
    savePlannedCategories("b1", ["a", "c"]);
    savePlannedCategories("b2", ["b"]);
    expect(loadPlannedCategories("b1")).toEqual(["a", "c"]);
    expect(loadPlannedCategories("b2")).toEqual(["b"]);
  });

  it("reads an untouched budget as 'everything'", () => {
    expect(loadPlannedCategories("b3")).toEqual([]);
  });

  it("shrugs off a corrupted entry instead of taking the chart down", () => {
    localStorage.setItem("budget:b4:planned-categories", "{not json");
    expect(loadPlannedCategories("b4")).toEqual([]);
  });
});
