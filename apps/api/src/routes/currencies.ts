/**
 * currencies.ts — /currencies route factory
 *
 * GET /currencies — returns the budgeting.supported_currencies allowlist.
 * Used by the Next.js web app's RSC server action to populate the currency picker.
 * No auth required: reference data is public-facing (the allowlist itself is not sensitive).
 */
import { Hono } from "hono";
import type { BootedDeps } from "../boot";

export function createCurrenciesRoute(_deps: BootedDeps) {
  const app = new Hono();

  app.get("/", async (c) => {
    const { listSupportedCurrenciesFromDb } = await import(
      "@budget/budgeting/src/adapters/persistence/supported-currencies-repo"
    );
    const rows = await listSupportedCurrenciesFromDb();
    return c.json({
      currencies: rows.map((r) => ({
        value: r.isoCode,
        label: r.isoCode,
        symbol: r.symbol,
        kind: r.kind,
      })),
    });
  });

  return app;
}
