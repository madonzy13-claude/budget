/**
 * instrument-repo.test.ts — REAL Postgres (no mock, per CLAUDE.md).
 * Verifies INV-07: local trigram search over budgeting.instruments ranks
 * exact-symbol > symbol-prefix > name-match, honors a >=2 char minimum, and
 * never returns inactive rows. The repo touches ONLY the local table — no
 * PriceProvider is injected (D-04).
 *
 * Seeds via the worker_role pool (app_role has SELECT-only on instruments);
 * the repo itself is pool-agnostic and searches on the same pool here.
 */
import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { Pool } from "pg";
import { DrizzleInstrumentRepo } from "../../src/adapters/persistence/instrument-repo";

const RAW = process.env.DATABASE_URL_WORKER ?? process.env.DATABASE_URL_APP;
if (!RAW)
  throw new Error(
    "DATABASE_URL_WORKER (or _APP) required for the instrument-repo integration test",
  );
const DB_URL = RAW.replace("@db:", "@localhost:");
const TEST_PROVIDER = "test_inv_search";

const pool = new Pool({ connectionString: DB_URL });
const repo = new DrizzleInstrumentRepo(pool);

beforeAll(async () => {
  // Clean any leftovers from a prior aborted run.
  await pool.query(`DELETE FROM budgeting.instruments WHERE provider = $1`, [
    TEST_PROVIDER,
  ]);
  await repo.upsert({
    symbol: "AAPL",
    displayName: "Apple Inc.",
    provider: TEST_PROVIDER,
    assetClass: "equities",
    quoteCurrency: "USD",
  });
  await repo.upsert({
    symbol: "BTC",
    displayName: "Bitcoin",
    provider: TEST_PROVIDER,
    assetClass: "crypto",
    quoteCurrency: "USD",
  });
  await repo.upsert({
    symbol: "XAU",
    displayName: "Gold (troy ounce)",
    provider: TEST_PROVIDER,
    assetClass: "commodity",
    quoteCurrency: "USD",
  });
  await repo.upsert({
    symbol: "AAPL_OLD",
    displayName: "Apple delisted shell",
    provider: TEST_PROVIDER,
    assetClass: "equities",
    quoteCurrency: "USD",
    active: false,
  });
});

afterAll(async () => {
  await pool.query(`DELETE FROM budgeting.instruments WHERE provider = $1`, [
    TEST_PROVIDER,
  ]);
  await pool.end();
});

describe("DrizzleInstrumentRepo.search (local trigram, INV-07)", () => {
  it("matches by symbol prefix", async () => {
    const r = await repo.search("AAP");
    expect(r.map((i) => i.symbol)).toContain("AAPL");
  });

  it("matches by display name", async () => {
    const r = await repo.search("App");
    expect(r.map((i) => i.symbol)).toContain("AAPL");
  });

  it("ranks the exact symbol match first", async () => {
    const r = await repo.search("AAPL");
    expect(r[0]?.symbol).toBe("AAPL");
  });

  it("returns nothing for a 1-char query (>=2 minimum)", async () => {
    const r = await repo.search("A");
    expect(r).toEqual([]);
  });

  it("never returns an inactive instrument", async () => {
    const r = await repo.search("AAPL_OLD");
    expect(r.find((i) => i.symbol === "AAPL_OLD")).toBeUndefined();
  });
});
