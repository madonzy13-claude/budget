/**
 * budgets-aggregate.ts — GET /budgets/aggregate (Task 7)
 *
 * Cross-budget "all budgets" rollup for the signed-in user (Task 6's
 * getAllBudgetsAggregate). MUST be mounted on /budgets BEFORE the main
 * budgetsRoutesFactory router (which owns GET /budgets/:id) — otherwise the
 * literal "aggregate" segment is captured as the :id param. See app.ts.
 */
import { Hono } from "hono";
import type { BootedDeps } from "../boot";

type AggregateDeps = Pick<BootedDeps, "budgeting">;

export function budgetsAggregateRoutesFactory(deps: AggregateDeps) {
  const r = new Hono();

  r.get("/aggregate", async (c) => {
    const session = c.get("session");
    if (!session) return c.json({ error: "unauthorized" }, 401);
    const out = await deps.budgeting.getAllBudgetsAggregate(session.user.id);
    return c.json(out);
  });

  // Task 9: combined net-worth trend across included budgets.
  r.get("/aggregate/wealth", async (c) => {
    const session = c.get("session");
    if (!session) return c.json({ error: "unauthorized" }, 401);
    const range = c.req.query("range") ?? "6M";
    const include = (c.req.query("include") ?? "").split(",").filter(Boolean);
    const out = await deps.budgeting.getAggregateWealthTrend({
      userId: session.user.id,
      range,
      includeIds: include,
    });
    return c.json(out);
  });

  return r;
}
