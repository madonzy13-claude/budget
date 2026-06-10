/**
 * fx.ts — GET /fx/rate route.
 * Read-cache + on-demand top-up for FX rates.
 * Returns {rate, fxRateDate, provider, isStale}.
 * On NoFxRateAvailable → 503 (client should retry later).
 *
 * Auth: requires authenticated session (route is mounted after authMiddleware).
 * Rate limiting: Phase 6 concern (T-2-02-01).
 */
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { NoFxRateAvailable } from "@budget/budgeting/src/adapters/fx/frankfurter";
import type { BootedDeps } from "../boot";

const rateQuerySchema = z.object({
  from: z.string().regex(/^[A-Z]{2,10}$/, "from must be an ISO currency code"),
  to: z.string().regex(/^[A-Z]{2,10}$/, "to must be an ISO currency code"),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD"),
});

export function createFxRoute(deps: Pick<BootedDeps, "budgeting">) {
  const app = new Hono();

  // GET /rate?from=USD&to=EUR&date=2026-05-09
  app.get("/rate", zValidator("query", rateQuerySchema), async (c) => {
    const { from, to, date } = c.req.valid("query");
    try {
      const r = await deps.budgeting.fxProvider.rateAsOf(
        from,
        to,
        new Date(`${date}T12:00:00Z`),
      );
      return c.json({
        rate: r.rate,
        fxRateDate: date,
        provider: r.provider,
        isStale: r.isStale,
      });
    } catch (e) {
      if (e instanceof NoFxRateAvailable) {
        return c.json({ error: "no_fx_rate_available" }, 503);
      }
      throw e;
    }
  });

  return app;
}
