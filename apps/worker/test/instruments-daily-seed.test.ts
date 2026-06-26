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
import { runInstrumentsDailySeed } from "../src/handlers/instruments-daily-seed";

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
