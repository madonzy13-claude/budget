/**
 * spendings-summary.ts — GET /budgets/:budgetId/spendings-summary route factory
 *
 * Returns the 5-row header data for the spendings grid:
 *   month, budgetCurrency, budgetTz, cushionModeEnabled, categories[]
 *
 * budgetTz is included at the top level so Plan 04-04's RSC does NOT need a
 * separate /budgets/:id fetch for timezone (resolves D-PH4-Q5).
 *
 * GRID-02, GRID-15, RSCM-03, RSCM-04
 */
import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import type { BootedDeps } from "../boot";
import { serverError } from "../middleware/server-error";

function pickTenant(c: any): string {
  const ids = c.get("tenantIds") as string[] | undefined;
  return ids?.[0] ?? "";
}

const querySchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/, "invalid_month_format"),
});

export function createSpendingsSummaryRoute(deps: BootedDeps) {
  const app = new Hono<{ Variables: Record<string, any> }>();

  // GET / — returns SpendingsSummaryDTO
  app.get("/", zValidator("query", querySchema), async (c) => {
    const tenantId = pickTenant(c);
    const budgetId = c.req.param("budgetId");
    if (budgetId !== tenantId) {
      return c.json({ error: "tenant_mismatch" }, 403);
    }

    const { month } = c.req.valid("query");
    const r = await deps.budgeting.getSpendingsSummary({
      tenantId,
      budgetId,
      month,
    });

    if (r.isErr()) {
      const msg = (r.error as Error).message;
      if (msg === "invalid_month") {
        return c.json({ error: "invalid_month" }, 422);
      }
      if (msg === "budget_not_found") {
        return c.json({ error: "not_found" }, 404);
      }
      return serverError(c, "spendings_summary_failed", r.error);
    }

    return c.json(r.value, 200);
  });

  return app;
}
