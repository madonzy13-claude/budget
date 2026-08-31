/**
 * fx-daily-fetch handler — pg-boss job that pre-populates budgeting.fx_rates.
 *
 * Runs HOURLY. It used to run once a day at 17:00 Europe/Berlin, which was
 * enough while the API could fetch a missing rate itself. It no longer can:
 * the API uses CacheOnlyFxProvider, so anything this job has not stored is
 * served as a stale-flagged prior rate. Hourly keeps that window small and
 * still costs ~24 upstream calls a day per pair.
 *
 * The queue NAME stays "fx-daily-fetch" despite the schedule change: pg-boss
 * keys schedules by queue name and persists them, so renaming would strand the
 * old daily row in the database and keep running it alongside the new one.
 *
 * Algorithm:
 * 1. Collect all distinct (base, quote) pairs the app will need to convert:
 *    - every (currency_orig, currency_default) in expense_ledger, and
 *    - every (wallet currency, budget default_currency) for live wallets.
 *
 *    The wallet half matters on its own: a wallet holding a currency that has
 *    no TRANSACTIONS in it still shows up in capitalization and net worth, and
 *    without a rate those totals silently counted it 1:1. Ledger-only pairs
 *    left that hole open for any account with, say, a dormant foreign account.
 * 2. For each pair call fxProvider.rateAsOf(base, quote, today).
 *    fxProvider internally caches results into budgeting.fx_rates.
 * 3. Returns { fetched, failed } counts for observability.
 *
 * No RLS needed: fx_rates is reference data; withInfraTx uses worker_role.
 */
import type { FxProvider } from "@budget/shared-kernel";
import { FX_PAIRS_SQL } from "./fx-pairs-sql";
import { withInfraTx } from "@budget/platform";

/** Queue name — unchanged on purpose; see the note above. */
export const FX_FETCH_QUEUE = "fx-daily-fetch";

/** Top of every hour, UTC. */
export const FX_FETCH_CRON = "0 * * * *";

// PgBoss type hint — pg-boss has no default export type we can use directly
interface PgBossLike {
  work(
    queue: string,
    handler: (job: unknown) => Promise<unknown>,
  ): Promise<void>;
}

export function registerFxDailyFetch(boss: PgBossLike, fxProvider: FxProvider) {
  boss.work(FX_FETCH_QUEUE, async () => {
    // Collect distinct (base, quote) pairs from expense_ledger
    let pairs: Array<{ base: string; quote: string }> = [];
    const result = await withInfraTx(async (tx) => {
      const rows = await tx.execute(FX_PAIRS_SQL);
      return rows.rows as Array<{ base: string; quote: string }>;
    });
    if (result.isOk()) {
      pairs = result.value;
    } else {
      // LOUD. This query used to name columns that do not exist
      // (currency_orig / currency_default), the error was swallowed here, and
      // the job then "succeeded" having fetched nothing at all — for months.
      // An empty pair list is indistinguishable from a healthy no-op, so the
      // failure has to say so itself.
      console.error(
        `[fx-daily-fetch] could not collect currency pairs: ${result.error.message}`,
      );
      throw result.error;
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
