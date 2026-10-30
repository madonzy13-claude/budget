/**
 * fx-history-backfill.test.ts — past dates have rates (13.1 round 6, user).
 *
 * Selling BTC into EUR dated 2024-05-03 failed: "No exchange rate for EUR on
 * 2024-05-03". The API reads rates from the cache only and the cache began in
 * 2026, so every earlier date had nothing. The backfill stores daily history
 * for every pair among the picker's currencies.
 */
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { Pool } from "pg";
import { startTestcontainer } from "@budget/db/test/testcontainer";
import { backfillFxHistory } from "../src/handlers/fx-history-backfill";

let workerPool: Pool;

beforeAll(async () => {
  const { urlWorker } = await startTestcontainer();
  workerPool = new Pool({ connectionString: urlWorker });
}, 180_000);

afterAll(async () => {
  await workerPool?.end();
});

/** A fake Frankfurter range endpoint: every day, rate = 1 + quote index. */
function fakeFetch(calls: string[]) {
  return (async (url: string) => {
    calls.push(url);
    const u = new URL(url);
    const base = u.searchParams.get("base")!;
    const quotes = u.searchParams.get("quotes")!.split(",");
    const out: Array<{
      date: string;
      base: string;
      quote: string;
      rate: number;
    }> = [];
    for (
      let d = new Date(`${u.searchParams.get("from")}T00:00:00Z`);
      d <= new Date(`${u.searchParams.get("to")}T00:00:00Z`);
      d.setUTCDate(d.getUTCDate() + 1)
    )
      quotes.forEach((quote, i) =>
        out.push({
          date: d.toISOString().slice(0, 10),
          base,
          quote,
          rate: 1 + i,
        }),
      );
    return new Response(JSON.stringify(out), { status: 200 });
  }) as unknown as typeof fetch;
}

describe("FX history backfill", () => {
  test("stores every pair for past dates, then skips what it already has", async () => {
    const calls: string[] = [];
    const currencies = ["EUR", "PLN", "USD"];
    const run = () =>
      backfillFxHistory({
        pool: workerPool,
        fetchFn: fakeFetch(calls),
        currencies,
        from: "2024-01-01",
        today: "2025-03-10",
      });
    await run();
    const { rows } = await workerPool.query<{ rate: string }>(
      `SELECT rate::text FROM budgeting.fx_rates
        WHERE base = 'USD' AND quote = 'EUR' AND date = '2024-05-03'`,
    );
    expect(rows).toHaveLength(1);
    const { rows: n } = await workerPool.query<{ n: string }>(
      `SELECT count(*)::text n FROM budgeting.fx_rates
        WHERE base IN ('EUR','PLN','USD') AND quote IN ('EUR','PLN','USD')
          AND date BETWEEN '2024-01-01' AND '2024-12-31'`,
    );
    expect(Number(n[0]!.n)).toBe(366 * 6);
    // 3 bases × 2 years.
    expect(calls).toHaveLength(6);

    calls.length = 0;
    await run();
    // A complete past year is skipped; the current one is refreshed.
    expect(calls).toHaveLength(3);
    expect(calls.every((c) => c.includes("from=2025-01-01"))).toBe(true);
  });

  test("never overwrites a stored rate", async () => {
    await workerPool.query(
      `INSERT INTO budgeting.fx_rates (base, quote, date, rate, provider)
       VALUES ('GBP', 'CHF', '2023-06-01', 9.9, 'frankfurter')
       ON CONFLICT (base, quote, date) DO UPDATE SET rate = 9.9`,
    );
    await backfillFxHistory({
      pool: workerPool,
      fetchFn: fakeFetch([]),
      currencies: ["GBP", "CHF"],
      from: "2023-01-01",
      today: "2023-12-31",
    });
    const { rows } = await workerPool.query<{ rate: string }>(
      `SELECT rate::text FROM budgeting.fx_rates
        WHERE base = 'GBP' AND quote = 'CHF' AND date = '2023-06-01'`,
    );
    expect(Number(rows[0]!.rate)).toBe(9.9);
  });

  test("a failing year is logged and skipped, the rest still land", async () => {
    const fetchFn = (async (url: string) =>
      url.includes("base=NOK")
        ? new Response("down", { status: 503 })
        : fakeFetch([])(url)) as unknown as typeof fetch;
    const res = await backfillFxHistory({
      pool: workerPool,
      fetchFn,
      currencies: ["NOK", "SEK"],
      from: "2022-01-01",
      today: "2022-12-31",
    });
    expect(res.failed).toBe(1);
    const { rows } = await workerPool.query(
      `SELECT 1 FROM budgeting.fx_rates
        WHERE base = 'SEK' AND quote = 'NOK' AND date = '2022-03-03'`,
    );
    expect(rows).toHaveLength(1);
  });
});
