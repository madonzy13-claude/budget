/**
 * actual-over-plan.test.ts — split the ACTUAL spend line at the planned total.
 *
 * The planned-vs-actual chart draws actual in grey while it stays within the
 * plan (needs + wants) and RED for the stretch where it runs past it (260731
 * user decision). Recharts can only colour a whole series, so the line is split
 * into two keys whose null gaps interlock — and the two must MEET at the
 * crossing, or the line shows a hole where the colour changes.
 */
import { describe, it, expect } from "vitest";
import { splitActualOverPlan } from "../../src/lib/actual-over-plan";

const row = (real: number, needs: number, wants = 0) => ({
  real,
  needs,
  wants,
});

describe("splitActualOverPlan", () => {
  it("keeps everything grey while actual stays within the plan", () => {
    const out = splitActualOverPlan([row(200, 500), row(450, 500)]);
    expect(out.map((r) => r.realOk)).toEqual([200, 450]);
    expect(out.map((r) => r.realOver)).toEqual([null, null]);
  });

  it("counts spending exactly ON the plan as still within it", () => {
    const out = splitActualOverPlan([row(500, 500)]);
    expect(out[0]!.realOk).toBe(500);
    expect(out[0]!.realOver).toBeNull();
  });

  it("marks the stretch past the plan as over", () => {
    const out = splitActualOverPlan([row(200, 500), row(900, 500)]);
    expect(out[1]!.realOver).toBe(900);
    expect(out[1]!.realOk).toBeNull();
  });

  it("joins the two pieces at the crossing so the line has no gap", () => {
    const out = splitActualOverPlan([row(200, 500), row(900, 500)]);
    // The last in-plan point also carries the red key, so the red segment
    // starts where the grey one ended.
    expect(out[0]!.realOver).toBe(200);
    expect(out[0]!.realOk).toBe(200);
  });

  it("joins again when the line comes back under the plan", () => {
    const out = splitActualOverPlan([
      row(900, 500),
      row(300, 500),
      row(320, 500),
    ]);
    expect(out[0]!.realOver).toBe(900);
    expect(out[0]!.realOk).toBe(900); // handshake back to grey
    expect(out[1]!.realOk).toBe(300);
    expect(out[1]!.realOver).toBeNull();
  });

  it("uses needs + wants as the plan line", () => {
    const out = splitActualOverPlan([row(700, 500, 300)]);
    expect(out[0]!.realOk).toBe(700); // 700 <= 800
    expect(out[0]!.realOver).toBeNull();
  });

  it("keeps the original row fields", () => {
    const out = splitActualOverPlan([{ ...row(700, 500), label: "1 Jul" }]);
    expect(out[0]!.label).toBe("1 Jul");
    expect(out[0]!.needs).toBe(500);
  });

  it("handles an empty series", () => {
    expect(splitActualOverPlan([])).toEqual([]);
  });
});
