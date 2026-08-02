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
  pickableCategories,
  PLANNED_PIE_PREF,
  PLANNED_TIMELINE_PREF,
  prunePlannedCategories,
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

describe("pickableCategories", () => {
  // Investing is not spending: the timeline leaves investment categories out of
  // its default view, so the picker must not offer them either. Ticking one
  // turned a plain "everything except House" into a chart where a month's
  // investing counted as overspend (user report, 260802).
  it("offers only what the chart counts", () => {
    expect(
      pickableCategories([
        { id: "a", name: "Food" },
        { id: "b", name: "Investments", isInvestment: true },
        { id: "c", name: "Rent" },
      ]),
    ).toEqual([
      { id: "a", name: "Food" },
      { id: "c", name: "Rent" },
    ]);
  });

  it("passes a budget with no investment category through untouched", () => {
    const cats = [{ id: "a", name: "Food" }];
    expect(pickableCategories(cats)).toEqual(cats);
  });
});
