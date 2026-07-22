import { describe, it, expect } from "vitest";
import { budgetSwitchPath } from "@/lib/bdp-tabs";

describe("budgetSwitchPath (same-pill budget switch)", () => {
  it("keeps the current pill when switching budgets", () => {
    expect(budgetSwitchPath("en", { id: "B" }, "/en/budgets/A/spendings")).toBe(
      "/en/budgets/B/spendings",
    );
    expect(budgetSwitchPath("pl", { id: "B" }, "/pl/budgets/A/settings")).toBe(
      "/pl/budgets/B/settings",
    );
  });

  it("ignores a trailing query/hash on the current path", () => {
    expect(
      budgetSwitchPath(
        "en",
        { id: "B" },
        "/en/budgets/A/spendings?month=2026-07",
      ),
    ).toBe("/en/budgets/B/spendings");
  });

  it("defaults to overview for a bare budget path, the home page, or null", () => {
    expect(budgetSwitchPath("en", { id: "B" }, "/en/budgets/A")).toBe(
      "/en/budgets/B/overview",
    );
    expect(budgetSwitchPath("en", { id: "B" }, "/en")).toBe(
      "/en/budgets/B/overview",
    );
    expect(budgetSwitchPath("en", { id: "B" }, null)).toBe(
      "/en/budgets/B/overview",
    );
  });

  it("keeps the reserves pill when the destination has reserves enabled (or unknown)", () => {
    expect(
      budgetSwitchPath(
        "en",
        { id: "B", reservesEnabled: true },
        "/en/budgets/A/reserves",
      ),
    ).toBe("/en/budgets/B/reserves");
    // unknown (undefined) → carry it; default is enabled and the page still guards
    expect(budgetSwitchPath("en", { id: "B" }, "/en/budgets/A/reserves")).toBe(
      "/en/budgets/B/reserves",
    );
  });

  it("falls back to overview when the destination has reserves disabled", () => {
    expect(
      budgetSwitchPath(
        "en",
        { id: "B", reservesEnabled: false },
        "/en/budgets/A/reserves",
      ),
    ).toBe("/en/budgets/B/overview");
  });
});
