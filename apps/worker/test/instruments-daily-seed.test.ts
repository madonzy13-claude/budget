import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import {
  seedBudget,
  seedInstrument,
  seedHolding,
  deleteBudgetInvestments,
  cleanupReferenceData,
  countPendingDelisted,
  workerSeedPool,
  appPool,
  type SeededBudget,
} from "./_investment-fixtures";
import { createTaskRepo } from "@budget/budgeting/src/adapters/persistence/task-repo";
import {
  runInstrumentsDailySeed,
  coldStartUniverseSeedIfEmpty,
} from "../src/handlers/instruments-daily-seed";

const PROVIDER = "test_seed";
let budget: SeededBudget;
let heldInst: string;
let unheldInst: string;
let heldHolding: string;

beforeAll(async () => {
  await cleanupReferenceData(PROVIDER);
  budget = await seedBudget();
  heldInst = await seedInstrument({
    symbol: "DELISTED",
    provider: PROVIDER,
    active: true,
  });
  unheldInst = await seedInstrument({
    symbol: "ORPHAN",
    provider: PROVIDER,
    active: true,
  });
  heldHolding = await seedHolding(budget.budgetId, {
    name: "Delisted Co",
    instrumentId: heldInst,
  });
  void unheldInst;
});

afterAll(async () => {
  await deleteBudgetInvestments(budget.budgetId);
  await cleanupReferenceData(PROVIDER);
});

describe("instruments-daily-seed job (D-09/D-10/T-9-11)", () => {
  // The feed omits DELISTED and ORPHAN (both provider=test_seed) → both deactivated.
  const fetchUniverse = async () => [
    {
      symbol: "STILL_LISTED",
      displayName: "Still Listed",
      provider: PROVIDER,
      assetClass: "equities" as const,
    },
  ];

  it("flags a held instrument absent from the feed inactive and emits exactly one delisted task; re-run does not duplicate", async () => {
    const taskRepo = createTaskRepo();

    await runInstrumentsDailySeed({ fetchUniverse, taskRepo });
    expect(await countPendingDelisted(heldHolding, budget.budgetId)).toBe(1);

    const inst = await workerSeedPool.query<{ active: boolean }>(
      `SELECT active FROM budgeting.instruments WHERE id = $1::uuid`,
      [heldInst],
    );
    expect(inst.rows[0].active).toBe(false);

    // Second run: ON CONFLICT DO NOTHING against tasks_investment_delisted_dedup_idx (0038)
    await runInstrumentsDailySeed({ fetchUniverse, taskRepo });
    expect(await countPendingDelisted(heldHolding, budget.budgetId)).toBe(1);
  });

  it("does NOT deactivate a provider's OTHER asset class absent from the feed (r28: a failed /etf feed delisted every US ETF)", async () => {
    // Same provider, but asset_class=etf and absent from the feed (which carries
    // only (PROVIDER, equities)) — mimics the single /etf bulk call failing while
    // the /stocks calls succeed. The etf must survive; deactivation is scoped to the
    // (provider, asset_class) slices actually present in the feed.
    const etfInst = await seedInstrument({
      symbol: "ETF_KEEP",
      provider: PROVIDER,
      assetClass: "etf",
      active: true,
    });
    await runInstrumentsDailySeed({
      fetchUniverse,
      taskRepo: createTaskRepo(),
    });
    const r = await workerSeedPool.query<{ active: boolean }>(
      `SELECT active FROM budgeting.instruments WHERE id = $1::uuid`,
      [etfInst],
    );
    expect(r.rows[0].active).toBe(true);
  });

  it("resolves the stale delisted task when the instrument reappears in the feed (reactivation, r31b)", async () => {
    const taskRepo = createTaskRepo();
    // Delisted state: the held instrument is omitted → deactivated + task emitted.
    await runInstrumentsDailySeed({ fetchUniverse, taskRepo });
    expect(await countPendingDelisted(heldHolding, budget.budgetId)).toBe(1);

    // The instrument REAPPEARS in the feed → step-1 upsert reactivates it, and the
    // new step-4 resolves the now-stale delisted task (holding chrome clears too).
    const fetchWithHeld = async () => [
      ...(await fetchUniverse()),
      {
        symbol: "DELISTED",
        displayName: "Delisted Co",
        provider: PROVIDER,
        assetClass: "equities" as const,
      },
    ];
    await runInstrumentsDailySeed({ fetchUniverse: fetchWithHeld, taskRepo });

    expect(await countPendingDelisted(heldHolding, budget.budgetId)).toBe(0);
    const inst = await workerSeedPool.query<{ active: boolean }>(
      `SELECT active FROM budgeting.instruments WHERE id = $1::uuid`,
      [heldInst],
    );
    expect(inst.rows[0].active).toBe(true);
  });

  it("an inactive instrument that no budget holds emits NO task", async () => {
    // ORPHAN was deactivated but is unheld → no task. Query under the budget GUC so
    // tasks RLS does not hide a (hypothetical) wrong emit. The budget has exactly the
    // one delisted task from the held holding; none reference ORPHAN.
    const c = await appPool.connect();
    try {
      await c.query("BEGIN");
      await c.query(`SELECT set_config('app.tenant_ids', $1, true)`, [
        `{${budget.budgetId}}`,
      ]);
      const r = await c.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM budgeting.tasks
          WHERE kind = 'INVESTMENT_INSTRUMENT_DELISTED'
            AND payload_json->>'instrument_symbol' = 'ORPHAN'`,
      );
      await c.query("COMMIT");
      expect(r.rows[0].n).toBe(0);
    } finally {
      c.release();
    }
  });
});

describe("cold-start universe seed — run the seed NOW when the table is empty (260626)", () => {
  it("enqueues the seed when no active instruments exist (count 0)", async () => {
    let sent = 0;
    const fired = await coldStartUniverseSeedIfEmpty({
      countActiveInstruments: async () => 0,
      enqueueSeed: async () => {
        sent += 1;
      },
    });
    // Empty universe → search returns nothing → fire the seed immediately
    // instead of waiting for the daily cron.
    expect(fired).toBe(true);
    expect(sent).toBe(1);
  });

  it("does NOT enqueue when the universe already has active instruments", async () => {
    let sent = 0;
    const fired = await coldStartUniverseSeedIfEmpty({
      countActiveInstruments: async () => 219_000,
      enqueueSeed: async () => {
        sent += 1;
      },
    });
    // A normal restart with a populated universe must not fire a redundant pull.
    expect(fired).toBe(false);
    expect(sent).toBe(0);
  });

  it("never lets a failing count crash boot — swallows and reports not-fired", async () => {
    let sent = 0;
    const fired = await coldStartUniverseSeedIfEmpty({
      countActiveInstruments: async () => {
        throw new Error("db down at boot");
      },
      enqueueSeed: async () => {
        sent += 1;
      },
    });
    expect(fired).toBe(false);
    expect(sent).toBe(0);
  });
});
