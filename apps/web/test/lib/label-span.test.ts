/**
 * label-span.test.ts — where a bar has to start and stop (260805).
 *
 * The breakdown bar sits over three centred figures, and it has to span the
 * WORDS: from the left edge of "Total spent" to the right edge of "Under plan".
 * The columns are equal but their labels are not, so this cannot be a fixed
 * inset — it has to be measured.
 */
import { describe, it, expect } from "vitest";
import { labelSpan } from "@/lib/label-span";

const box = { left: 0, right: 300 };

describe("labelSpan", () => {
  it("insets to where the first and last words actually begin and end", () => {
    expect(
      labelSpan(box, { left: 20, right: 80 }, { left: 220, right: 285 }),
    ).toEqual({
      left: 20,
      right: 15,
    });
  });

  it("never insets outward when a label overhangs its column", () => {
    expect(
      labelSpan(box, { left: -8, right: 80 }, { left: 220, right: 320 }),
    ).toEqual({
      left: 0,
      right: 0,
    });
  });

  it("stays at nothing until the row has been measured", () => {
    expect(
      labelSpan(
        { left: 0, right: 0 },
        { left: 0, right: 0 },
        { left: 0, right: 0 },
      ),
    ).toEqual({
      left: 0,
      right: 0,
    });
  });
});
