import { describe, it, expect } from "vitest";
import {
  wrapIndex,
  nextNavIndex,
  nextFieldIndex,
  nextHighlightIndex,
} from "@/lib/roving-index";

describe("roving-index", () => {
  it("wraps indices into range", () => {
    expect(wrapIndex(0, 3)).toBe(0);
    expect(wrapIndex(3, 3)).toBe(0);
    expect(wrapIndex(-1, 3)).toBe(2);
    expect(wrapIndex(4, 3)).toBe(1);
    expect(wrapIndex(0, 0)).toBe(0);
  });

  it("moves the highlight with wrap; enters at an end from nothing", () => {
    // from nothing (-1)
    expect(nextNavIndex(-1, 4, 1)).toBe(0); // Down → top
    expect(nextNavIndex(-1, 4, -1)).toBe(3); // Up → bottom
    // within
    expect(nextNavIndex(0, 4, 1)).toBe(1);
    expect(nextNavIndex(3, 4, 1)).toBe(0); // wrap down
    expect(nextNavIndex(0, 4, -1)).toBe(3); // wrap up
    // empty list
    expect(nextNavIndex(0, 0, 1)).toBe(-1);
  });

  it("picks the next highlight after a removal (next sibling, clamp, empty)", () => {
    // remove the first of 3 → the item now at 0 (the old second)
    expect(nextHighlightIndex(0, 2)).toBe(0);
    // remove the middle → the item that slid into that slot
    expect(nextHighlightIndex(1, 2)).toBe(1);
    // remove the LAST → clamp to the new last (e.g. the section's add button)
    expect(nextHighlightIndex(3, 3)).toBe(2);
    // removed the only item → nothing left
    expect(nextHighlightIndex(0, 0)).toBe(-1);
  });

  it("hops fields icon→name→currency→amount with wrap; enters at an end", () => {
    expect(nextFieldIndex(null, 1)).toBe(0); // → icon
    expect(nextFieldIndex(null, -1)).toBe(3); // ← amount
    expect(nextFieldIndex(0, 1)).toBe(1); // icon → name
    expect(nextFieldIndex(3, 1)).toBe(0); // amount → wrap icon
    expect(nextFieldIndex(0, -1)).toBe(3); // icon → wrap amount
  });
});
