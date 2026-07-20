import { describe, it, expect } from "vitest";
import { Wallet, Shapes } from "lucide-react";
import { holdingIcon, UI_TYPE_ICON } from "../../src/lib/investment-icons";

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
    ).toBe("#3b82f6");
  });
});

describe("savings + other icons (260720)", () => {
  it("savings uses the Wallet icon", () => {
    expect(UI_TYPE_ICON.savings).toBe(Wallet);
  });

  it("other uses Shapes — no more three-dots MoreHorizontal", () => {
    expect(UI_TYPE_ICON.other).toBe(Shapes);
  });

  it("holdingIcon resolves a savings holding to Wallet + an accent color", () => {
    const { Icon, color } = holdingIcon({
      uiType: "savings",
      holdingType: "savings",
      isCustom: true,
    });
    expect(Icon).toBe(Wallet);
    expect(color).toMatch(/^#[0-9a-f]{6}$/i);
  });
});
