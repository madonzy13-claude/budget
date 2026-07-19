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
  await pool.query(
    `DELETE FROM budgeting.instruments WHERE provider = $1 OR symbol LIKE 'QQZZ%'`,
    [TEST_PROVIDER],
  );
  // Unique "QQZZ" marker symbols/names so assertions don't collide with the ~219k
  // real instruments the 9.2 universe seed loads into the shared dev DB.
  await repo.upsert({
    symbol: "QQZZAP",
    displayName: "Qqzz Apple Inc.",
    provider: TEST_PROVIDER,
    assetClass: "equities",
    quoteCurrency: "USD",
  });
  await repo.upsert({
    symbol: "QQZZBT",
    displayName: "Qqzz Bitcoin",
    provider: TEST_PROVIDER,
    assetClass: "crypto",
    quoteCurrency: "USD",
  });
  await repo.upsert({
    symbol: "QQZZAU",
    displayName: "Qqzz Gold (troy ounce)",
    provider: TEST_PROVIDER,
    assetClass: "commodity",
    quoteCurrency: "USD",
  });
  await repo.upsert({
    symbol: "QQZZAP_OLD",
    displayName: "Qqzz Apple delisted shell",
    provider: TEST_PROVIDER,
    assetClass: "equities",
    quoteCurrency: "USD",
    active: false,
  });
  // Two name-matching rows with different prominence — the higher rank must
  // surface first within the same match tier (9.2 ranked universe).
  await repo.upsert({
    symbol: "QQZZBIG",
    displayName: "Qqzz Zeta Bank Holdings PLC",
    provider: TEST_PROVIDER,
    assetClass: "equities",
    quoteCurrency: "USD",
    rank: 90,
  });
  await repo.upsert({
    symbol: "QQZZSML",
    displayName: "Qqzz Zeta Bank Microcap Ltd",
    provider: TEST_PROVIDER,
    assetClass: "equities",
    quoteCurrency: "USD",
    rank: 5,
  });
  // A non-US, un-priceable row (stored as manual:<MIC>). Search must NOT surface it.
  await repo.upsert({
    symbol: "QQZZMAN",
    displayName: "Qqzz Warsaw Listed SA",
    provider: "manual:XWAR",
    assetClass: "equities",
    quoteCurrency: "PLN",
    rank: 70,
  });
});

afterAll(async () => {
  await pool.query(
    `DELETE FROM budgeting.instruments WHERE provider = $1 OR symbol LIKE 'QQZZ%'`,
    [TEST_PROVIDER],
  );
  await pool.end();
});

describe("DrizzleInstrumentRepo.search (local trigram, INV-07)", () => {
  it("matches by symbol prefix", async () => {
    const r = await repo.search("QQZZA");
    expect(r.map((i) => i.symbol)).toContain("QQZZAP");
  });

  it("matches by display name", async () => {
    const r = await repo.search("Qqzz App");
    expect(r.map((i) => i.symbol)).toContain("QQZZAP");
  });

  it("ranks the exact symbol match first", async () => {
    const r = await repo.search("QQZZAP");
    expect(r[0]?.symbol).toBe("QQZZAP");
  });

  it("within a match tier, surfaces the higher-rank (more prominent) row first", async () => {
    const r = await repo.search("Qqzz Zeta Bank");
    const symbols = r.map((i) => i.symbol);
    expect(symbols).toContain("QQZZBIG");
    expect(symbols).toContain("QQZZSML");
    expect(symbols.indexOf("QQZZBIG")).toBeLessThan(symbols.indexOf("QQZZSML"));
    expect(r.find((i) => i.symbol === "QQZZBIG")?.rank).toBe(90);
  });

  it("returns nothing for a 1-char query (>=2 minimum)", async () => {
    const r = await repo.search("A");
    expect(r).toEqual([]);
  });

  it("never returns an inactive instrument", async () => {
    const r = await repo.search("QQZZAP_OLD");
    expect(r.find((i) => i.symbol === "QQZZAP_OLD")).toBeUndefined();
  });

  it("never returns a manual (non-US, un-priceable) instrument", async () => {
    // Direct symbol hit AND a broad prefix — both must exclude the manual row.
    expect((await repo.search("QQZZMAN")).map((i) => i.symbol)).not.toContain(
      "QQZZMAN",
    );
    expect((await repo.search("QQZZ")).map((i) => i.symbol)).not.toContain(
      "QQZZMAN",
    );
  });

  it("findById returns the matching instrument", async () => {
    const hits = await repo.search("QQZZAP");
    const id = hits.find((i) => i.symbol === "QQZZAP")!.id;
    const found = await repo.findById(id);
    expect(found?.symbol).toBe("QQZZAP");
    expect(found?.assetClass).toBe("equities");
  });

  it("findById returns null for a missing id", async () => {
    const found = await repo.findById("00000000-0000-0000-0000-000000000000");
    expect(found).toBeNull();
  });
});
