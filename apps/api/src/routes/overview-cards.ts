/**
 * overview-cards.ts — GET /budgets/:id/overview/cards (11-03).
 *
 * Registers the Overview cards endpoint onto the budgets router (mirrors the
 * inline cushion-summary/home-summary handlers). Tenant guard:
 * tenantIds.includes(budgetId) → 404 (Pattern D — T-11-05 IDOR mitigation).
 *
 * The service returns bigint cents; every *_cents is .toString()'d here at the
 * route boundary (the single bigint→string conversion point).
 */
import type { Hono } from "hono";
import type { BootedDeps } from "../boot";
import { serverError } from "../middleware/server-error";

export function registerOverviewCardsRoutes(r: Hono, deps: BootedDeps) {
  r.get("/:id/overview/cards", async (c) => {
    const session = c.get("session");
    if (!session) return c.json({ error: "unauthorized" }, 401);

    const budgetId = c.req.param("id");
    const tenantIds = c.get("tenantIds") as string[] | undefined;
    if (!tenantIds || !tenantIds.includes(budgetId)) {
      return c.json({ error: "not_found" }, 404);
    }

    const result = await deps.budgeting.getOverviewCards({
      tenantId: budgetId, // v1.1: budget_id === tenant_id
      budgetId,
    });
    if (result.isErr())
      return serverError(c, "overview_cards_failed", result.error);

    const dto = result.value;
    return c.json(
      {
        default_currency: dto.default_currency,
        available_to_spend_cents: dto.available_to_spend_cents.toString(),
        capitalization_cents: dto.capitalization_cents.toString(),
        investment_value_cents: dto.investment_value_cents.toString(),
        available_reserves_cents: dto.available_reserves_cents.toString(),
        cushion: {
          enabled: dto.cushion.enabled,
          real_months: dto.cushion.real_months,
          total_cents: dto.cushion.total_cents.toString(),
        },
        overspent: {
          count: dto.overspent.count,
          currency: dto.overspent.currency,
          top: dto.overspent.top.map((t) => ({
            category_id: t.category_id,
            name: t.name,
            over_amount_cents: t.over_amount_cents.toString(),
          })),
        },
      },
      200,
    );
  });
}
