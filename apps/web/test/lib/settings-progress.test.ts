import { describe, it, expect } from "vitest";
import {
  computeSettingsProgress,
  settingsProgressTier,
} from "@/lib/settings-progress";

const ALL_ON = {
  hasTransaction: true,
  cushionEnabled: true,
  hasCushionWallet: true,
  reservesEnabled: true,
  hasReserveWallet: true,
  investmentsEnabled: true,
  hasInvestment: true,
  hasRecurring: true,
  hasIncome: true,
  hasCategory: true,
};

const ALL_OFF = {
  hasTransaction: false,
  cushionEnabled: false,
  hasCushionWallet: false,
  reservesEnabled: false,
  hasReserveWallet: false,
  investmentsEnabled: false,
  hasInvestment: false,
  hasRecurring: false,
  hasIncome: false,
  hasCategory: false,
};

const keys = (p: ReturnType<typeof computeSettingsProgress>) =>
  p.items.map((i) => i.key);

describe("computeSettingsProgress", () => {
  it("all features on → 11 items, weights sum to 100, 100%", () => {
    const p = computeSettingsProgress(ALL_ON);
    expect(p.items).toHaveLength(11);
    expect(p.items.reduce((s, x) => s + x.weight, 0)).toBe(100);
    expect(p.percent).toBe(100);
    expect(settingsProgressTier(p.percent)).toBe("done");
  });

  it("identity 5% always done; transaction 5%", () => {
    const p = computeSettingsProgress({ ...ALL_OFF, hasTransaction: true });
    expect(p.items.find((i) => i.key === "identity")?.weight).toBe(5);
    expect(p.percent).toBe(10); // identity 5 + transaction 5
  });

  it("feature OFF hides its wallet/investment step and drops both 10s", () => {
    const p = computeSettingsProgress({
      ...ALL_ON,
      reservesEnabled: false,
    });
    expect(keys(p)).not.toContain("reserveWallet");
    expect(p.percent).toBe(80); // −10 reservesEnabled, −10 reserveWallet (hidden)
  });

  it("a hidden wallet behind a disabled feature is NOT counted even if it exists", () => {
    const p = computeSettingsProgress({
      ...ALL_ON,
      cushionEnabled: false,
      hasCushionWallet: true, // exists but hidden → must not count
    });
    expect(keys(p)).not.toContain("cushionWallet");
    expect(p.percent).toBe(80);
  });

  it("all off → only identity (5%), wallet steps hidden (8 items)", () => {
    const p = computeSettingsProgress(ALL_OFF);
    expect(p.items).toHaveLength(8); // no cushion/reserve/investment sub-steps
    expect(p.percent).toBe(5);
  });
});
