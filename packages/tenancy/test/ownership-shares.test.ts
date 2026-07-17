import { describe, it, expect } from "bun:test";
import {
  validateShares,
  InvalidShareTotal,
} from "../src/domain/ownership-shares";

describe("validateShares", () => {
  it("accepts an even split that sums to 100 (34/33/33)", () => {
    expect(() =>
      validateShares([
        { userId: "a", pct: 34 },
        { userId: "b", pct: 33 },
        { userId: "c", pct: 33 },
      ]),
    ).not.toThrow();
  });
  it("accepts a single owner at 100", () => {
    expect(() => validateShares([{ userId: "a", pct: 100 }])).not.toThrow();
  });
  it("rejects a total of 99", () => {
    expect(() =>
      validateShares([
        { userId: "a", pct: 60 },
        { userId: "b", pct: 39 },
      ]),
    ).toThrow(InvalidShareTotal);
  });
  it("rejects a total of 101", () => {
    expect(() =>
      validateShares([
        { userId: "a", pct: 60 },
        { userId: "b", pct: 41 },
      ]),
    ).toThrow(InvalidShareTotal);
  });
  it("rejects a negative or non-integer pct", () => {
    expect(() =>
      validateShares([
        { userId: "a", pct: -1 },
        { userId: "b", pct: 101 },
      ]),
    ).toThrow(InvalidShareTotal);
    expect(() =>
      validateShares([
        { userId: "a", pct: 33.5 },
        { userId: "b", pct: 66.5 },
      ]),
    ).toThrow(InvalidShareTotal);
  });
});
