/**
 * overview-projection.ts — GET /budgets/:id/overview/projection.
 *
 * Registers the Overview cash-flow projection endpoint onto the budgets router
 * (mirrors registerOverviewCardsRoutes). Tenant guard: tenantIds.includes(budgetId)
 * → 404. bigint cents → string at this single boundary.
 */
import type { Hono } from "hono";
import type { BootedDeps } from "../boot";
import { serverError } from "../middleware/server-error";

export function registerOverviewProjectionRoutes(r: Hono, deps: BootedDeps) {
  r.get("/:id/overview/projection", async (c) => {
    const session = c.get("session");
    if (!session) return c.json({ error: "unauthorized" }, 401);

    const budgetId = c.req.param("id");
    const tenantIds = c.get("tenantIds") as string[] | undefined;
    if (!tenantIds || !tenantIds.includes(budgetId)) {
      return c.json({ error: "not_found" }, 404);
    }

    try {
      const p = await deps.budgeting.getCashflowProjection({
        tenantId: budgetId,
        budgetId,
      });
      return c.json(
        {
          currency: p.currency,
          days: p.days.map((d) => ({
            date: d.date,
            color: d.color,
            available_cents: d.availableCents.toString(),
            income_cents: d.incomeCents.toString(),
            bill_cents: d.billCents.toString(),
            drew_reserve: d.drewReserve.map((x) => ({
              category_id: x.categoryId,
              name: x.name,
              amount_cents: x.amountCents.toString(),
            })),
            shortfall: d.shortfall.map((x) => ({
              category_id: x.categoryId,
              name: x.name,
              amount_cents: x.amountCents.toString(),
            })),
          })),
          income_points: p.incomePoints.map((x) => ({
            date: x.date,
            name: x.name,
            amount_cents: x.amountCents.toString(),
          })),
          bill_points: p.billPoints.map((x) => ({
            date: x.date,
            name: x.name,
            category_id: x.categoryId,
            amount_cents: x.amountCents.toString(),
          })),
          summary: {
            first_yellow_date: p.summary.firstYellowDate,
            first_red_date: p.summary.firstRedDate,
            worst_shortfall_cents: p.summary.worstShortfallCents.toString(),
          },
        },
        200,
      );
    } catch (e) {
      return serverError(c, "overview_projection_failed", e as Error);
    }
  });
}
