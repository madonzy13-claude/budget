import { describe, it, expect } from "vitest";
import {
  KIND_TO_PILL,
  pillFor,
  kindsFor,
} from "@/components/budgeting/tasks/kind-pill-map";

describe("kind-pill-map", () => {
  it("maps RESERVE_TOPUP → reserves", () => {
    expect(pillFor("RESERVE_TOPUP")).toBe("reserves");
  });

  it("maps CUSHION_BELOW_TARGET → wallets", () => {
    expect(pillFor("CUSHION_BELOW_TARGET")).toBe("wallets");
  });

  it("maps CONFIRM_DRAFT → spendings", () => {
    expect(pillFor("CONFIRM_DRAFT")).toBe("spendings");
  });

  it("kindsFor('reserves') returns [RESERVE_TOPUP]", () => {
    expect(kindsFor("reserves")).toEqual(["RESERVE_TOPUP"]);
  });

  it("kindsFor('wallets') returns [CUSHION_BELOW_TARGET]", () => {
    expect(kindsFor("wallets")).toEqual(["CUSHION_BELOW_TARGET"]);
  });

  it("kindsFor('spendings') returns [CONFIRM_DRAFT]", () => {
    expect(kindsFor("spendings")).toEqual(["CONFIRM_DRAFT"]);
  });

  it("kindsFor('settings') returns [] (no kind maps to Settings today)", () => {
    expect(kindsFor("settings")).toEqual([]);
  });

  it("round-trip: kindsFor(pillFor(kind)).includes(kind)", () => {
    const kinds = [
      "RESERVE_TOPUP",
      "CUSHION_BELOW_TARGET",
      "CONFIRM_DRAFT",
    ] as const;
    for (const k of kinds) {
      expect(kindsFor(pillFor(k))).toContain(k);
    }
  });

  it("KIND_TO_PILL keys are exactly the 3 task kinds", () => {
    expect(Object.keys(KIND_TO_PILL).sort()).toEqual(
      ["CONFIRM_DRAFT", "CUSHION_BELOW_TARGET", "RESERVE_TOPUP"].sort(),
    );
  });
});
