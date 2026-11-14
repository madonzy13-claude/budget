import { createBdd } from "playwright-bdd";
import { afterScenario, test } from "../fixtures/fresh-user-per-scenario";

const { Given } = createBdd(test);

/**
 * fx-seed.steps.ts — the one place E2E writes budgeting.fx_rates.
 *
 * FrankfurterFxProvider is cache-then-live: a MISS goes out to
 * api.frankfurter.dev over the network, with no timeout of its own. A CI
 * database is fresh, so every pair missed and the aggregate endpoint sat on a
 * third-party API — the run of 260814 spent longer than the page's 10s wait
 * and failed all four attempts, having passed everywhere the cache was warm.
 * Seeding the exact date the read uses (UTC today) keeps conversion on the box.
 *
 * 13.1 UAT 14: on the shared dev DB these rows outlived the run and, being
 * non-reciprocal, skewed a real sale's realized gain. Rows are inserted ON
 * CONFLICT DO NOTHING (a real rate is never overwritten) and only the rows
 * THIS scenario inserted are deleted after it.
 */
type FxRow = { base: string; quote: string; date: string; rate: string };

const seeded: { base: string; quote: string; date: string }[] = [];

/** UTC ISO date for `YYYY-MM-DD`, `today` or `today-N`. */
export function resolveFxDate(token: string): string {
  const m = /^today(?:-(\d+))?$/.exec(token);
  if (!m) return token;
  const back = Number.parseInt(m[1] ?? "0", 10);
  return new Date(Date.now() - back * 86_400_000).toISOString().slice(0, 10);
}

export async function seedFxRows(rows: FxRow[]): Promise<void> {
  const { Pool } = await import("pg");
  // fx_rates is the WORKER's table — app_role has no INSERT on it, and should
  // not: production writes it from the daily fetch job.
  const dbUrl =
    process.env.DATABASE_URL_WORKER?.replace("@db:", "@localhost:") ?? "";
  if (!dbUrl) throw new Error("DATABASE_URL_WORKER not set — cannot seed FX");
  const pool = new Pool({ connectionString: dbUrl });
  const before = seeded.length;
  try {
    for (const { base, quote, date, rate } of rows) {
      const r = await pool.query(
        `INSERT INTO budgeting.fx_rates (base, quote, date, rate, provider, fetched_at)
         VALUES ($1, $2, $3::date, $4, 'e2e-seed', now())
         ON CONFLICT DO NOTHING
         RETURNING base, quote, date::text AS date`,
        [base, quote, date, rate],
      );
      seeded.push(...r.rows);
    }
  } finally {
    await pool.end();
  }
  if (before === 0 && seeded.length > 0) afterScenario(deleteSeededFx);
}

/** The aggregate scenarios' pairs, today and yesterday (a run crossing
 *  midnight UTC would otherwise miss). Exact reciprocals; rates > 1 where the
 *  "combined net worth is greater than the USD budget alone" check needs it. */
export async function seedFxRates(): Promise<void> {
  const pairs: [string, string, string][] = [
    ["EUR", "USD", "1.08"],
    ["USD", "EUR", "0.925926"], // 1 / 1.08
    ["PLN", "USD", "0.25"],
    ["USD", "PLN", "4.00"],
    ["EUR", "PLN", "4.32"],
    ["PLN", "EUR", "0.231481"], // 1 / 4.32
  ];
  await seedFxRows(
    ["today", "today-1"].flatMap((d) =>
      pairs.map(([base, quote, rate]) => ({ base, quote, rate, date: resolveFxDate(d) })),
    ),
  );
}

/** Only fx_rates' owner may delete (worker_role cannot, by design) — clean up
 *  as the migrator, and only the rows this run inserted. */
export async function deleteSeededFx(): Promise<void> {
  const { Pool } = await import("pg");
  const dbUrl =
    process.env.DATABASE_URL_MIGRATOR?.replace("@db:", "@localhost:") ?? "";
  if (!dbUrl)
    throw new Error("DATABASE_URL_MIGRATOR not set — cannot clean FX");
  const pool = new Pool({ connectionString: dbUrl });
  try {
    for (const r of seeded.splice(0))
      await pool.query(
        `DELETE FROM budgeting.fx_rates
          WHERE base = $1 AND quote = $2 AND date = $3::date AND provider = 'e2e-seed'`,
        [r.base, r.quote, r.date],
      );
  } finally {
    await pool.end();
  }
}

Given(
  "the FX rate {string} to {string} on {string} is {string}",
  async ({}, base: string, quote: string, date: string, rate: string) => {
    await seedFxRows([{ base, quote, date: resolveFxDate(date), rate }]);
  },
);
