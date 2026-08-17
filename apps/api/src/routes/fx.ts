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
import type { Currency } from "@budget/shared-kernel";
import type { BootedDeps } from "../boot";

/**
 * The Currency union, not a loose /^[A-Z]{2,10}$/. The old regex accepted codes
 * the domain cannot represent (e.g. "ZZZ"), which only typechecked because the
 * route was talking to a concrete adapter whose signature took `string`. Now it
 * talks to the FxProvider PORT, which takes Currency — so the boundary has to
 * actually validate. A rejected code is a 400 here instead of nonsense deeper in.
 */
const CURRENCIES = [
  "USD",
  "EUR",
  "PLN",
  "GBP",
  "UAH",
  "CHF",
  "NOK",
  "SEK",
  "BTC",
  "ETH",
] as const satisfies readonly Currency[];

const rateQuerySchema = z.object({
  from: z.enum(CURRENCIES),
  to: z.enum(CURRENCIES),
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
