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
      // Investments view: subtract contributions so the whole view is net of
      // money paid in (real market movement). "1" = on.
      net: z.enum(["0", "1"]).optional(),
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
      net: parsed.data.net === "1",
    });
    if (result.isErr())
      return serverError(c, "overview_wealth_failed", result.error);
    return c.json(result.value, 200);
  });

  // 15-21: past wealth points from an imported balance history (decision b2).
  const importSchema = z.object({
    points: z
      .array(
        z.object({
          date: z.string().regex(DATE_RE),
          wallets: z
            .array(
              z.object({
                amount_cents: z.string().regex(/^-?\d{1,15}$/),
                currency: z.string().regex(/^[A-Z0-9]{3,5}$/),
              }),
            )
            .min(1),
        }),
      )
      .min(1)
      .max(500),
  });

  r.post("/:id/overview/wealth-snapshots/import", async (c) => {
    const session = c.get("session");
    if (!session) return c.json({ error: "unauthorized" }, 401);
    const budgetId = c.req.param("id");
    const tenantIds = c.get("tenantIds") as string[] | undefined;
    if (!tenantIds || !tenantIds.includes(budgetId)) {
      return c.json({ error: "not_found" }, 404);
    }
    const parsed = importSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return c.json({ error: "Validation error", issues: parsed.error.issues }, 422);
    }
    const result = await deps.budgeting.importWealthSnapshots({
      budgetId,
      points: parsed.data.points.map((p) => ({
        date: p.date,
        wallets: p.wallets.map((w) => ({ amountCents: BigInt(w.amount_cents), currency: w.currency.toUpperCase() })),
      })),
    });
    if (result.isErr())
      return serverError(c, "wealth_snapshot_import_failed", result.error);
    return c.json(result.value, 201);
  });

  r.delete("/:id/overview/wealth-snapshots/:snapshotId", async (c) => {
    const session = c.get("session");
    if (!session) return c.json({ error: "unauthorized" }, 401);
    const budgetId = c.req.param("id");
    const tenantIds = c.get("tenantIds") as string[] | undefined;
    const id = c.req.param("snapshotId");
    if (!tenantIds || !tenantIds.includes(budgetId) || !z.uuid().safeParse(id).success) {
      return c.json({ error: "not_found" }, 404);
    }
    const deleted = await deps.budgeting.deleteImportedWealthSnapshot(budgetId, id);
    return deleted ? c.body(null, 204) : c.json({ error: "not_found" }, 404);
  });
}
