/**
 * overview-wealth.ts — GET /budgets/:id/overview/wealth?from&to&view (11-06).
 *
 * Registers the Financial-Wealth section endpoint onto the budgets router. Zod
 * validates the range (from<=to, span cap) + view ∈ {capitalization,investments}
 * (T-11-03); all values bind as Drizzle parameters. Tenant guard:
 * tenantIds.includes(budgetId) → 404 (IDOR). from/to default to the last 12
 * months when omitted. The service already returns *_cents as strings.
 */
import type { Hono } from "hono";
import { z } from "zod";
import type { BootedDeps } from "../boot";
import { serverError } from "../middleware/server-error";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MS_PER_DAY = 86_400_000;
const MAX_SPAN_DAYS = 5 * 366; // ~5 years

export function registerOverviewWealthRoutes(r: Hono, deps: BootedDeps) {
  const querySchema = z
    .object({
      from: z.string().regex(DATE_RE),
      to: z.string().regex(DATE_RE),
      view: z.enum(["capitalization", "investments"]).default("capitalization"),
    })
    .refine((q) => q.from <= q.to, { message: "from_after_to" })
    .refine(
      (q) =>
        (Date.parse(`${q.to}T00:00:00Z`) - Date.parse(`${q.from}T00:00:00Z`)) /
          MS_PER_DAY <=
        MAX_SPAN_DAYS,
      { message: "range_too_wide" },
    );

  r.get("/:id/overview/wealth", async (c) => {
    const session = c.get("session");
    if (!session) return c.json({ error: "unauthorized" }, 401);

    const budgetId = c.req.param("id");
    const tenantIds = c.get("tenantIds") as string[] | undefined;
    if (!tenantIds || !tenantIds.includes(budgetId)) {
      return c.json({ error: "not_found" }, 404);
    }

    const parsed = querySchema.safeParse(c.req.query());
    if (!parsed.success) {
      return c.json({ error: "invalid_range" }, 400);
    }

    const result = await deps.budgeting.getOverviewWealth({
      tenantId: budgetId, // v1.1: budget_id === tenant_id
      budgetId,
      from: parsed.data.from,
      to: parsed.data.to,
      view: parsed.data.view,
    });
    if (result.isErr())
      return serverError(c, "overview_wealth_failed", result.error);
    return c.json(result.value, 200);
  });
}
