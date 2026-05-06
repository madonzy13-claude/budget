import { test, expect } from "bun:test";
import { types } from "pg";
import { configureNumericParsers } from "../src/db/numeric-parser";

test("configureNumericParsers casts BIGINT to bigint", () => {
  configureNumericParsers();
  const parser = types.getTypeParser(20);
  expect(parser("123456789012345")).toBe(123456789012345n);
});
test("NUMERIC stays string (no parser override)", () => {
  configureNumericParsers();
  const parser = types.getTypeParser(1700);
  // Default pg-types parser for NUMERIC returns string; we ASSERT we did NOT change it
  expect(typeof parser("1.99")).toBe("string");
  expect(parser("1.99")).toBe("1.99");
});
