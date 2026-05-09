import { describe, test, expect } from "bun:test";
import { validateShares } from "../../src/domain/share-validation";

describe("Share Validation", () => {
  test("rejects empty array", () => {
    const result = validateShares([]);
    expect(result.isErr()).toBe(true);
  });

  test("rejects percentage below 0", () => {
    const result = validateShares([{ userId: "u1", percentage: "-1" }]);
    expect(result.isErr()).toBe(true);
  });

  test("rejects percentage above 100", () => {
    const result = validateShares([{ userId: "u1", percentage: "101" }]);
    expect(result.isErr()).toBe(true);
  });

  test("rejects sum != 100 beyond tolerance 0.005", () => {
    // 99 + 0.004 = 99.004 — more than 0.005 away from 100
    const result = validateShares([
      { userId: "u1", percentage: "60" },
      { userId: "u2", percentage: "39" },
    ]);
    expect(result.isErr()).toBe(true);
  });

  test("accepts sum == 100 exactly", () => {
    const result = validateShares([
      { userId: "u1", percentage: "60" },
      { userId: "u2", percentage: "40" },
    ]);
    expect(result.isOk()).toBe(true);
  });

  test("accepts sum within tolerance (sum = 100.004)", () => {
    const result = validateShares([
      { userId: "u1", percentage: "60" },
      { userId: "u2", percentage: "40.004" },
    ]);
    expect(result.isOk()).toBe(true);
  });

  test("rejects sum outside tolerance (sum = 100.006)", () => {
    const result = validateShares([
      { userId: "u1", percentage: "60" },
      { userId: "u2", percentage: "40.006" },
    ]);
    expect(result.isErr()).toBe(true);
  });
});
