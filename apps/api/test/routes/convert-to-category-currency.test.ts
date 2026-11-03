/**
 * amount-currency-conversion.test.ts — Phase 14 (user, 261103): the rebalance
 * dialogs on the Overview work in the BUDGET currency. When they set a foreign
 * category's reserve or limit they say which currency the amount is in, and
 * the server converts it into the category's currency at today's rate.
 */
import { describe, it, expect } from "bun:test";
import { Hono } from "hono";
import { ok } from "@budget/shared-kernel";

const calls: Record<string, unknown>[] = [];
const deps = {
  budgeting: {
    findCategoryById: async () => ok({ id: "cat-1", currency: "EUR" }),
    fxProvider: {
      rateAsOf: async (from: string, to: string) => ({
        rate: from === "PLN" && to === "EUR" ? "0.25" : "1",
        provider: "test",
        isStale: false,
      }),
    },
    adjustCategoryReserve: async (input: Record<string, unknown>) => {
      calls.push({ kind: "adjust", ...input });
      return ok({});
    },
    setCategoryLimit: async (input: Record<string, unknown>) => {
      calls.push({ kind: "limit", ...input });
      return ok({});
    },
  },
} as never;

async function app() {
  const { createCategoryLimitsRoute } = await import("../../src/routes/category-limits");
  const a = new Hono();
  a.use(async (c, next) => {
    c.set("session", { user: { id: "u1" } });
    c.set("tenantIds", ["b1"]);
    c.set("tenantId", "b1");
    c.set("userId", "u1");
    await next();
  });
  a.route("/categories", createCategoryLimitsRoute(deps));
  return { a };
}

describe("Amounts sent in another currency than the category's", () => {
  it("a limit in PLN for a EUR category is stored in EUR at today's rate", async () => {
    const { a } = await app();
    const res = await a.request("/categories/cat-1/limits", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        normalAmount: "100000",
        cushionAmount: "40000",
        needsAmount: "60000",
        wantsAmount: "40000",
        effectiveFrom: "2026-11-01",
        amountsCurrency: "PLN",
      }),
    });
    expect(res.status).toBe(201);
    expect(calls.at(-1)).toMatchObject({
      normalAmount: "25000",
      cushionAmount: "10000",
      needsAmount: "15000",
      wantsAmount: "10000",
      normalCurrency: "EUR",
      cushionCurrency: "EUR",
    });
  });
});

describe("A reserve target sent in another currency", () => {
  it("converts into the category's currency at today's rate (shared by the adjust route)", async () => {
    const { categoryCurrencyConverter } = await import("../../src/routes/convert-to-category-currency");
    const conv = await categoryCurrencyConverter((deps as { budgeting: never }).budgeting, "b1", "cat-1", "PLN");
    expect(conv.ok && conv.convert("100000")).toBe("25000");
    const same = await categoryCurrencyConverter((deps as { budgeting: never }).budgeting, "b1", "cat-1", "EUR");
    expect(same.ok && same.convert("100000")).toBe("100000");
    const bad = await categoryCurrencyConverter((deps as { budgeting: never }).budgeting, "b1", "cat-1", "JPY");
    expect(bad).toEqual({ ok: false, error: "invalid_currency" });
  });
});
