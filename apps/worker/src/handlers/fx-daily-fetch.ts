/**
 * fx-daily-fetch handler — daily pg-boss job to pre-populate budgeting.fx_rates.
 * Scheduled at 0 17 * * * (17:00 CET/CEST, Europe/Berlin tz) so rates are fresh
 * after Frankfurter publishes (~16:00 CET on trading days).
 *
 * Algorithm:
 * 1. Collect all distinct (currency_orig, currency_default) pairs from expense_ledger.
 * 2. For each pair call fxProvider.rateAsOf(base, quote, today).
 *    fxProvider internally caches results into budgeting.fx_rates.
 * 3. Returns { fetched, failed } counts for observability.
 *
 * No RLS needed: fx_rates is reference data; withInfraTx uses worker_role.
 */
import type { FxProvider } from "@budget/shared-kernel";
import { withInfraTx } from "@budget/platform";
import { sql } from "drizzle-orm";

// PgBoss type hint — pg-boss has no default export type we can use directly
interface PgBossLike {
  work(
    queue: string,
    handler: (job: unknown) => Promise<unknown>,
  ): Promise<void>;
}

export function registerFxDailyFetch(boss: PgBossLike, fxProvider: FxProvider) {
  boss.work("fx-daily-fetch", async () => {
    // Collect distinct (base, quote) pairs from expense_ledger
    let pairs: Array<{ base: string; quote: string }> = [];
    const result = await withInfraTx(async (tx) => {
      const rows = await tx.execute(sql`
        SELECT DISTINCT currency_orig AS base, currency_default AS quote
        FROM budgeting.expense_ledger
        WHERE currency_orig IS NOT NULL AND currency_default IS NOT NULL
          AND currency_orig <> currency_default
      `);
      return rows.rows as Array<{ base: string; quote: string }>;
    });
    if (result.isOk()) {
      pairs = result.value;
    }

    const today = new Date();
    let fetched = 0;
    let failed = 0;

    type FxArg = Parameters<typeof fxProvider.rateAsOf>[0];
    for (const { base, quote } of pairs) {
      try {
        await fxProvider.rateAsOf(base as FxArg, quote as FxArg, today);
        fetched++;
      } catch {
        failed++;
      }
    }

    return { fetched, failed };
  });
}
