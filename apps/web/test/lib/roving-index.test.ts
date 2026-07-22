import { describe, it, expect } from "vitest";
import { wrapIndex, nextNavIndex, nextFieldIndex } from "@/lib/roving-index";

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

  it("hops fields name→currency→amount with wrap; enters at an end", () => {
    expect(nextFieldIndex(null, 1)).toBe(0); // → name
    expect(nextFieldIndex(null, -1)).toBe(2); // ← amount
    expect(nextFieldIndex(0, 1)).toBe(1); // name → currency
    expect(nextFieldIndex(2, 1)).toBe(0); // amount → wrap name
    expect(nextFieldIndex(0, -1)).toBe(2); // name → wrap amount
  });
});
