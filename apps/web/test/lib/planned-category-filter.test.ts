/**
 * planned-category-filter.test.ts — the timeline's category multi-select (260802).
 *
 * Picking every category — or none at all — is the same as not filtering, so the
 * chart asks for everything. The choice is remembered per budget on the MEMBER's
 * own row, and never carries an id the budget no longer has.
 */
import { describe, it, expect } from "vitest";
import {
  effectiveCategoryIds,
  narrowedCategoryCount,
  PLANNED_PIE_PREF,
  PLANNED_TIMELINE_PREF,
  prunePlannedCategories,
} from "../../src/lib/planned-category-filter";

const ALL = ["a", "b", "c"];

// The pie's centre says "All categories" — which was a lie the moment a
// category was unticked. It only stays true when nothing is filtered out, or
// when the only thing dropped is the investment category: investments are not
// planned spending, so hiding that slice narrows nothing (user, 260812).
describe("narrowedCategoryCount", () => {
  const cats = [
    { id: "a", isInvestment: false },
    { id: "b", isInvestment: false },
    { id: "inv", isInvestment: true },
  ];

  it("is null when nothing is picked (the picker means 'everything')", () => {
    expect(narrowedCategoryCount([], cats)).toBeNull();
  });

  it("is null when every category is picked", () => {
    expect(narrowedCategoryCount(["a", "b", "inv"], cats)).toBeNull();
  });

  it("is null when ONLY the investment category is dropped", () => {
    expect(narrowedCategoryCount(["a", "b"], cats)).toBeNull();
  });

  it("counts the picked categories once a real one is dropped", () => {
    expect(narrowedCategoryCount(["a", "inv"], cats)).toBe(2);
    expect(narrowedCategoryCount(["a"], cats)).toBe(1);
  });

  it("ignores ids the budget no longer has", () => {
    expect(narrowedCategoryCount(["a", "b", "gone"], cats)).toBeNull();
  });
});

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
  // The choice itself now lives on the MEMBER's row for the budget (see
  // use-member-ui-prefs) rather than in localStorage, which is a device and not
  // a person: the same user on a second machine was back to "All categories"
  // (user report, 260802). All that is left here is the key each chart claims.
  it("gives each chart its own key, so one pick never clears the other", () => {
    expect(PLANNED_TIMELINE_PREF).not.toBe(PLANNED_PIE_PREF);
  });

  it("keeps the timeline on the key its stored picks were already written under", () => {
    expect(PLANNED_TIMELINE_PREF).toBe("planned-categories");
  });
});
