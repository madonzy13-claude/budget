import { describe, test, expect } from "bun:test";

describe("Phase 2 conftest", () => {
  test("DATABASE_URL_APP is set (testcontainer fixture)", () => {
    // This test is RED in Wave-0 (plan 02-01) until plan 02-02 wires testcontainers.
    // It documents the contract: integration tests require DATABASE_URL_APP.
    expect(process.env.DATABASE_URL_APP).toBeDefined();
  });

  test("@budget/budgeting/test/helpers exports freshTenant", async () => {
    const helpers = await import("@budget/budgeting/test/helpers");
    expect(typeof helpers.freshTenant).toBe("function");
  });

  test("@budget/budgeting/test/helpers exports withTenantTxFixture", async () => {
    const helpers = await import("@budget/budgeting/test/helpers");
    expect(typeof helpers.withTenantTxFixture).toBe("function");
  });

  test("@budget/budgeting/test/helpers exports seedFxRate", async () => {
    const helpers = await import("@budget/budgeting/test/helpers");
    expect(typeof helpers.seedFxRate).toBe("function");
  });

  test("@budget/budgeting/test/helpers exports freezeTime", async () => {
    const helpers = await import("@budget/budgeting/test/helpers");
    expect(typeof helpers.freezeTime).toBe("function");
  });
});
