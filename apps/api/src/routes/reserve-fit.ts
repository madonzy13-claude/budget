/**
 * reserve-fit.ts — the reserve-sizing chart (260804).
 *
 *   GET /budgets/:id/overview/reserve-fit?from&to   held vs needed, per category
 *   PUT /budgets/:id/reserve-fit/exclusions         tick a spend off as a one-off
 *
 * Same shape as the other overview routes: Zod-validate the range before any SQL,
 * tenant guard by tenantIds.includes(budgetId) → 404 (IDOR), DTO passes through
 * with *_cents already strings.
 *
 * The PUT is an analysis annotation, NOT a money write: it changes what the chart
 * calls "needed" and nothing else — no reserve balance, no used, no overspent.
 */
import type { Hono } from "hono";
import { z } from "zod";
import type { BootedDeps } from "../boot";
import { serverError } from "../middleware/server-error";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MS_PER_DAY = 86_400_000;
const MAX_SPAN_DAYS = 5 * 366; // ~5 years, same cap as the other overview ranges

export function registerReserveFitRoutes(r: Hono, deps: BootedDeps) {
  const querySchema = z
    .object({
      from: z.string().regex(DATE_RE),
      to: z.string().regex(DATE_RE),
    })
    .refine((q) => q.from <= q.to, { message: "from_after_to" })
    .refine(
      (q) =>
        (Date.parse(`${q.to}T00:00:00Z`) - Date.parse(`${q.from}T00:00:00Z`)) /
          MS_PER_DAY <=
        MAX_SPAN_DAYS,
      { message: "range_too_wide" },
    );

  const bodySchema = z.object({
    ledgerId: z.string().uuid(),
    excluded: z.boolean(),
  });

  r.get("/:id/overview/reserve-fit", async (c) => {
    const session = c.get("session");
    if (!session) return c.json({ error: "unauthorized" }, 401);

    const budgetId = c.req.param("id");
    const tenantIds = c.get("tenantIds") as string[] | undefined;
    if (!tenantIds || !tenantIds.includes(budgetId)) {
      return c.json({ error: "not_found" }, 404);
    }

    const parsed = querySchema.safeParse(c.req.query());
    if (!parsed.success) return c.json({ error: "invalid_range" }, 400);

    const result = await deps.budgeting.getReserveFit({
      tenantId: budgetId, // v1.1: budget_id === tenant_id
      budgetId,
      from: parsed.data.from,
      to: parsed.data.to,
    });
    if (result.isErr())
      return serverError(c, "reserve_fit_failed", result.error);
    return c.json(result.value, 200);
  });

  r.put("/:id/reserve-fit/exclusions", async (c) => {
    const session = c.get("session");
    if (!session) return c.json({ error: "unauthorized" }, 401);

    const budgetId = c.req.param("id");
    const tenantIds = c.get("tenantIds") as string[] | undefined;
    if (!tenantIds || !tenantIds.includes(budgetId)) {
      return c.json({ error: "not_found" }, 404);
    }

    const body = await c.req.json().catch(() => null);
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) return c.json({ error: "invalid_body" }, 400);

    try {
      await deps.budgeting.setReserveFitExclusion({
        budgetId,
        ledgerId: parsed.data.ledgerId,
        excluded: parsed.data.excluded,
        actorUserId: session.user.id,
      });
    } catch (e) {
      return serverError(c, "reserve_fit_exclusion_failed", e as Error);
    }
    return c.json({ ok: true }, 200);
  });
}
