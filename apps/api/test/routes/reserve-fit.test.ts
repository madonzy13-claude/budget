/**
 * reserve-fit.test.ts — the reserve-sizing endpoints (260804).
 *
 * GET hands the chart its rows; PUT records "this spend was a one-off" for the
 * whole budget. Both are tenant-guarded the same way as the other overview
 * routes: a budget id the caller is not a member of is a 404, never a 403 that
 * would confirm the budget exists.
 */
import { describe, it, expect } from "bun:test";
import { Hono } from "hono";
import { ok } from "@budget/shared-kernel";
import { registerReserveFitRoutes } from "../../src/routes/reserve-fit";

const BUDGET = "11111111-1111-4111-8111-111111111111";
const LEDGER = "22222222-2222-4222-8222-222222222222";

const DTO = {
  currency: "PLN",
  rows: [
    {
      category_id: "c1",
      name: "Sport",
      held_cents: "460000",
      needed_cents: "0",
      gap_cents: "460000",
      worst_month: "2026-02",
      worst_overage_cents: "480000",
      overage_months: 1,
      months_counted: 12,
      large_transactions: [],
    },
  ],
};

function buildApp(
  session: unknown,
  over: { fit?: unknown; setExclusion?: unknown } = {},
) {
  const calls: Record<string, unknown>[] = [];
  const app = new Hono();
  app.use(async (c: any, next: any) => {
    c.set("session", session as any);
    c.set("tenantIds", session ? [BUDGET] : []);
    await next();
  });
  const deps = {
    budgeting: {
      getReserveFit:
        over.fit ??
        (async (input: Record<string, unknown>) => {
          calls.push({ get: input });
          return ok(DTO);
        }),
      setReserveFitExclusion:
        over.setExclusion ??
        (async (input: Record<string, unknown>) => {
          calls.push({ put: input });
        }),
    },
  };
  const r = new Hono();
  registerReserveFitRoutes(r, deps as never);
  app.route("/budgets", r);
  return { app, calls };
}

const SESSION = { user: { id: "user-1" } };
const RANGE = "from=2026-01-01&to=2026-12-31";

describe("GET /budgets/:id/overview/reserve-fit", () => {
  it("returns the rows for a member → 200", async () => {
    const { app, calls } = buildApp(SESSION);
    const res = await app.request(
      `/budgets/${BUDGET}/overview/reserve-fit?${RANGE}`,
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(DTO);
    expect(calls[0]).toEqual({
      get: {
        tenantId: BUDGET,
        budgetId: BUDGET,
        from: "2026-01-01",
        to: "2026-12-31",
      },
    });
  });

  it("rejects an anonymous caller → 401", async () => {
    const { app } = buildApp(null);
    const res = await app.request(
      `/budgets/${BUDGET}/overview/reserve-fit?${RANGE}`,
    );
    expect(res.status).toBe(401);
  });

  it("hides someone else's budget behind a 404", async () => {
    const { app, calls } = buildApp(SESSION);
    const other = "33333333-3333-4333-8333-333333333333";
    const res = await app.request(
      `/budgets/${other}/overview/reserve-fit?${RANGE}`,
    );
    expect(res.status).toBe(404);
    expect(calls).toEqual([]);
  });

  it("rejects a backwards range → 400", async () => {
    const { app } = buildApp(SESSION);
    const res = await app.request(
      `/budgets/${BUDGET}/overview/reserve-fit?from=2026-12-31&to=2026-01-01`,
    );
    expect(res.status).toBe(400);
  });
});

describe("PUT /budgets/:id/reserve-fit/exclusions", () => {
  const put = (app: Hono, body: unknown, budget = BUDGET) =>
    app.request(`/budgets/${budget}/reserve-fit/exclusions`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

  it("records the un-tick against the budget and the caller → 200", async () => {
    const { app, calls } = buildApp(SESSION);
    const res = await put(app, { ledgerId: LEDGER, excluded: true });
    expect(res.status).toBe(200);
    expect(calls[0]).toEqual({
      put: {
        budgetId: BUDGET,
        ledgerId: LEDGER,
        excluded: true,
        actorUserId: "user-1",
      },
    });
  });

  it("takes the tick back", async () => {
    const { app, calls } = buildApp(SESSION);
    await put(app, { ledgerId: LEDGER, excluded: false });
    expect((calls[0] as { put: { excluded: boolean } }).put.excluded).toBe(
      false,
    );
  });

  it("rejects an anonymous caller → 401", async () => {
    const { app } = buildApp(null);
    expect((await put(app, { ledgerId: LEDGER, excluded: true })).status).toBe(
      401,
    );
  });

  it("hides someone else's budget behind a 404, writing nothing", async () => {
    const { app, calls } = buildApp(SESSION);
    const res = await put(
      app,
      { ledgerId: LEDGER, excluded: true },
      "33333333-3333-4333-8333-333333333333",
    );
    expect(res.status).toBe(404);
    expect(calls).toEqual([]);
  });

  it("rejects a body that is not a ledger id → 400", async () => {
    const { app, calls } = buildApp(SESSION);
    expect((await put(app, { ledgerId: "nope", excluded: true })).status).toBe(
      400,
    );
    expect((await put(app, { ledgerId: LEDGER })).status).toBe(400);
    expect(calls).toEqual([]);
  });
});
