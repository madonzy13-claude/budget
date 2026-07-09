import { describe, it, expect } from "vitest";
import { holdingIcon } from "../../src/lib/investment-icons";

describe("holdingIcon — precious-metals accent is metal-aware (260626)", () => {
  const base = {
    uiType: "precious_metals" as const,
    holdingType: "commodity",
    isCustom: false,
  };

  it("gold keeps the gold accent", () => {
    expect(holdingIcon({ ...base, metal: "gold" }).color).toBe("#eab308");
  });

  // Silver, platinum and palladium are silvery — render them grey, NOT gold, and
  // a light grey that stands out against the dark grey card background.
  it.each(["silver", "platinum", "palladium"])(
    "%s renders the silver-grey accent (not gold)",
    (metal) => {
      const { color } = holdingIcon({ ...base, metal });
      expect(color).toBe("#cbd5e1");
      expect(color).not.toBe("#eab308");
    },
  );

  it("precious-metals with no metal set falls back to gold", () => {
    expect(holdingIcon({ ...base, metal: null }).color).toBe("#eab308");
  });

  it("non-metals are unaffected (equity stays blue)", () => {
    expect(
      holdingIcon({
        uiType: "equity",
        holdingType: "equities",
        isCustom: false,
      }).color,
    ).toBe("#4ea1ff");
  });
});
