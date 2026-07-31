/**
 * actual-over-plan.test.ts — mark the ACTUAL stretch that runs past the plan.
 *
 * The chart keeps one grey actual area and strokes RED over the part that
 * exceeds needs + wants (260731). The overlay must be null while spending stays
 * within the plan and must reach the neighbouring point at a crossing, or the red
 * stroke would float above the line instead of continuing it.
 */
import { describe, it, expect } from "vitest";
import { splitActualOverPlan } from "../../src/lib/actual-over-plan";

const row = (real: number, needs: number, wants = 0) => ({
  real,
  needs,
  wants,
});

describe("splitActualOverPlan", () => {
  it("marks nothing while actual stays within the plan", () => {
    const out = splitActualOverPlan([row(200, 500), row(450, 500)]);
    expect(out.map((r) => r.realOver)).toEqual([null, null]);
  });

  it("counts spending exactly ON the plan as still within it", () => {
    expect(splitActualOverPlan([row(500, 500)])[0]!.realOver).toBeNull();
  });

  it("marks the stretch past the plan", () => {
    const out = splitActualOverPlan([row(200, 500), row(900, 500)]);
    expect(out[1]!.realOver).toBe(900);
  });

  it("reaches back to the last in-plan point so the red stroke starts on the line", () => {
    const out = splitActualOverPlan([row(200, 500), row(900, 500)]);
    expect(out[0]!.realOver).toBe(200);
  });

  it("reaches forward to the first in-plan point when it comes back under", () => {
    const out = splitActualOverPlan([
      row(900, 500),
      row(300, 500),
      row(320, 500),
    ]);
    expect(out[1]!.realOver).toBe(300); // handshake
    expect(out[2]!.realOver).toBeNull(); // fully back inside the plan
  });

  it("uses needs + wants as the plan line", () => {
    expect(splitActualOverPlan([row(700, 500, 300)])[0]!.realOver).toBeNull();
  });

  it("keeps the actual value and the original row fields untouched", () => {
    const out = splitActualOverPlan([{ ...row(700, 500), label: "1 Jul" }]);
    expect(out[0]!.label).toBe("1 Jul");
    expect(out[0]!.real).toBe(700);
    expect(out[0]!.needs).toBe(500);
  });

  it("handles an empty series", () => {
    expect(splitActualOverPlan([])).toEqual([]);
  });
});
