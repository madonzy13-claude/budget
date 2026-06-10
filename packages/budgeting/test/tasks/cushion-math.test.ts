/**
 * cushion-math.test.ts — Phase 7 Plan 03 (Wave 1 GREEN of Wave 0 scaffold).
 *
 * 9-case Nyquist coverage for the cushion math foundation:
 *   1. no emit when cushion_enabled = false
 *   2. emit when cushion_enabled = true AND shortfall > 0
 *   3. no emit when shortfall = 0 (actual >= required)
 *   4. resolve when cushion_enabled toggled off
 *   5. resolve when shortfall eliminated by adding cushion wallet
 *   6. FX rate variance — wallet in non-budget currency converts correctly
 *   7. empty cushion wallets — actual = 0, shortfall = full required
 *   8. cushion_target_months change triggers recompute
 *   9. category cushion change triggers recompute
 *
 * Tests use real Postgres (Docker — DATABASE_URL_APP) per CLAUDE.md rule 3
 * (no DB mocking in integration tests).
 *
 * Each test seeds its own fresh budget with a unique uuid — no cross-test
 * cleanup needed because seeded budget_ids never collide and partial unique
 * indexes are scoped to (budget_id, kind, status='PENDING').
 *
 * FxProvider is stubbed in-memory (no Frankfurter HTTP) — keeps tests fast
 * and deterministic. Test 6 exercises the FX path explicitly.
 *
 * Requires migration 0026 applied so:
 *   - tenancy.budgets.cushion_target_months column exists
 *   - tasks_kind_chk accepts 'CUSHION_BELOW_TARGET'
 *   - tasks_cushion_below_target_pending_uq partial index exists
 */
import { describe, it, expect } from "bun:test";
import { Pool } from "pg";

const DB_URL_RAW = process.env.DATABASE_URL_APP;
if (!DB_URL_RAW) {
  throw new Error(
    "DATABASE_URL_APP required for cushion-math integration tests",
  );
}
process.env.DATABASE_URL_APP = DB_URL_RAW.replace("@db:", "@localhost:");
const DB_URL = process.env.DATABASE_URL_APP;

const { resetPools, withTenantTx } = await import("@budget/platform");
const { TenantId, UserId } = await import("@budget/shared-kernel");
const { computeCushionSummary, getCushionSummary } =
  await import("@budget/budgeting/src/application/get-cushion-summary");
const { recomputeCushionTask } =
  await import("@budget/budgeting/src/application/recompute-cushion-task");
const { createTaskRepo } =
  await import("@budget/budgeting/src/adapters/persistence/task-repo");
resetPools();

/* -------------------------------------------------------------------------- */
/* Stub FxProvider — returns fixed rates from an in-memory map.               */
/* Shape matches FxProviderLike (string args, { rate, provider, isStale }).   */
/* -------------------------------------------------------------------------- */
function stubFxProvider(rates: Record<string, number>) {
  return {
    async rateAsOf(from: string, to: string, _asOf: Date) {
      if (from === to) {
        return { rate: "1", provider: "stub", isStale: false };
      }
      const key = `${from}->${to}`;
      const rate = rates[key];
      if (rate == null) {
        throw new Error(`stubFxProvider: no rate for ${key}`);
      }
      return { rate: rate.toString(), provider: "stub", isStale: false };
    },
  };
}

/* -------------------------------------------------------------------------- */
/* Seed helper — creates a fresh user + budget + budget_members + optional    */
/* category_limit row + optional cushion wallets. v1.1 invariant:             */
/* tenant_id === budget_id, so seeded budget_id is also the tenant_id.        */
/* -------------------------------------------------------------------------- */
interface SeedBudgetInput {
  cushionEnabled: boolean;
  cushionTargetMonths: number;
  defaultCurrency: string;
  /** When provided, seeds ONE category with this cushion amount (bigint cents). */
  categoryCushionCents?: bigint;
  /** CUSHION wallets to insert. current_balance is amountCents / 100. */
  cushionWallets?: Array<{ currency: string; amountCents: bigint }>;
}

interface SeededBudget {
  userId: string;
  budgetId: string;
  categoryId: string | null;
}

async function seedBudget(input: SeedBudgetInput): Promise<SeededBudget> {
  const pool = new Pool({ connectionString: DB_URL });
  const client = await pool.connect();
  const userId = crypto.randomUUID();
  const budgetId = crypto.randomUUID();
  let categoryId: string | null = null;
  try {
    await client.query("BEGIN");
    // Tenant context — covers writes that bypass app role RLS via FORCE RLS.
    await client.query(
      `SELECT set_config('app.tenant_ids', '{"${budgetId}"}', true)`,
    );
    await client.query(
      `SELECT set_config('app.current_user_id', '${userId}', true)`,
    );

    await client.query(
      `INSERT INTO identity.users (id, email, name, email_verified, created_at, updated_at)
       VALUES ($1, $2, 'Cushion Math', true, now(), now())`,
      [userId, `cushion-math-${userId.slice(0, 8)}@example.com`],
    );

    await client.query(
      `INSERT INTO tenancy.budgets
         (id, slug, name, kind, default_currency, owner_user_id, member_count,
          cushion_enabled, cushion_target_months, created_at)
       VALUES ($1, $2, 'Cushion Math Budget', 'PRIVATE', $3, $4, 1, $5, $6, now())`,
      [
        budgetId,
        `ws-cushmath-${budgetId.slice(0, 8)}`,
        input.defaultCurrency,
        userId,
        input.cushionEnabled,
        input.cushionTargetMonths,
      ],
    );

    await client.query(
      `INSERT INTO tenancy.budget_members (id, budget_id, user_id, role, created_at)
       VALUES ($1, $2, $3, 'owner', now())`,
      [crypto.randomUUID(), budgetId, userId],
    );

    if (input.categoryCushionCents != null) {
      categoryId = crypto.randomUUID();
      await client.query(
        `INSERT INTO budgeting.categories
           (id, tenant_id, name, sort_index, reserve_excluded, actor_user_id, created_at)
         VALUES ($1, $2, 'Test Category', 0, false, $3, now())`,
        [categoryId, budgetId, userId],
      );
      // SCD-2 active row: effective_from <= today, effective_to NULL.
      // cushion_amount is canonical NOT NULL bigint column (parity with
      // budget-home-summary-repo.ts and the new get-cushion-summary.ts reader).
      await client.query(
        `INSERT INTO budgeting.category_limits
           (id, tenant_id, category_id,
            normal_amount, normal_currency,
            cushion_amount, cushion_currency,
            cushion_amount_cents,
            effective_from, effective_to, actor_user_id, created_at)
         VALUES (gen_random_uuid(), $1, $2,
                 0, $3,
                 $4, $3,
                 $4,
                 CURRENT_DATE - INTERVAL '1 day', NULL, $5, now())`,
        [
          budgetId,
          categoryId,
          input.defaultCurrency,
          input.categoryCushionCents.toString(),
          userId,
        ],
      );
    }

    for (const w of input.cushionWallets ?? []) {
      // current_balance is numeric(19,4). amount_cents = current_balance * 100.
      const balance = (Number(w.amountCents) / 100).toFixed(4);
      await client.query(
        `INSERT INTO budgeting.wallets
           (id, tenant_id, name, currency, current_balance, wallet_type, sort_order, actor_user_id, created_at)
         VALUES (gen_random_uuid(), $1, 'Cushion Wallet', $2, $3, 'CUSHION', 0, $4, now())`,
        [budgetId, w.currency, balance, userId],
      );
    }

    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
    await pool.end();
  }
  return { userId, budgetId, categoryId };
}

/** Count PENDING CUSHION_BELOW_TARGET tasks for the budget (RLS-scoped read).
 *  IMPORTANT: set_config(..., true) is transaction-local — read MUST be inside
 *  a BEGIN/COMMIT block or the RLS GUC has no effect and the policy filters
 *  every row. */
async function countPendingCushionTasks(budgetId: string): Promise<number> {
  const pool = new Pool({ connectionString: DB_URL });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `SELECT set_config('app.tenant_ids', '{"${budgetId}"}', true)`,
    );
    await client.query(
      `SELECT set_config('app.current_user_id', '${budgetId}', true)`,
    );
    const result = await client.query(
      `SELECT COUNT(*)::int AS cnt
         FROM budgeting.tasks
        WHERE budget_id = $1::uuid
          AND kind = 'CUSHION_BELOW_TARGET'
          AND status = 'PENDING'`,
      [budgetId],
    );
    await client.query("COMMIT");
    return (result.rows[0]?.cnt as number) ?? 0;
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
    await pool.end();
  }
}

/** Read the single PENDING cushion task's payload for assertion. */
async function readPendingCushionPayload(
  budgetId: string,
): Promise<Record<string, unknown> | null> {
  const pool = new Pool({ connectionString: DB_URL });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `SELECT set_config('app.tenant_ids', '{"${budgetId}"}', true)`,
    );
    await client.query(
      `SELECT set_config('app.current_user_id', '${budgetId}', true)`,
    );
    const result = await client.query(
      `SELECT payload_json
         FROM budgeting.tasks
        WHERE budget_id = $1::uuid
          AND kind = 'CUSHION_BELOW_TARGET'
          AND status = 'PENDING'
        LIMIT 1`,
      [budgetId],
    );
    await client.query("COMMIT");
    if (result.rows.length === 0) return null;
    return result.rows[0].payload_json as Record<string, unknown>;
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
    await pool.end();
  }
}

/** Seed an already-PENDING cushion task directly (for resolve-test setup). */
async function seedPendingCushionTask(budgetId: string): Promise<void> {
  const pool = new Pool({ connectionString: DB_URL });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `SELECT set_config('app.tenant_ids', '{"${budgetId}"}', true)`,
    );
    await client.query(
      `SELECT set_config('app.current_user_id', '${budgetId}', true)`,
    );
    await client.query(
      `INSERT INTO budgeting.tasks
         (id, tenant_id, budget_id, kind, payload_json, status)
       VALUES (gen_random_uuid(), $1, $1, 'CUSHION_BELOW_TARGET',
               '{"shortfall_cents":"1","required_cents":"1","actual_cents":"0","currency":"EUR","target_months":6}'::jsonb,
               'PENDING')`,
      [budgetId],
    );
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
    await pool.end();
  }
}

async function setBudgetCushionEnabled(
  budgetId: string,
  enabled: boolean,
): Promise<void> {
  const pool = new Pool({ connectionString: DB_URL });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `SELECT set_config('app.tenant_ids', '{"${budgetId}"}', true)`,
    );
    await client.query(
      `SELECT set_config('app.current_user_id', '${budgetId}', true)`,
    );
    await client.query(
      `UPDATE tenancy.budgets SET cushion_enabled = $2 WHERE id = $1::uuid`,
      [budgetId, enabled],
    );
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
    await pool.end();
  }
}

async function setBudgetCushionTargetMonths(
  budgetId: string,
  months: number,
): Promise<void> {
  const pool = new Pool({ connectionString: DB_URL });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `SELECT set_config('app.tenant_ids', '{"${budgetId}"}', true)`,
    );
    await client.query(
      `SELECT set_config('app.current_user_id', '${budgetId}', true)`,
    );
    await client.query(
      `UPDATE tenancy.budgets SET cushion_target_months = $2 WHERE id = $1::uuid`,
      [budgetId, months],
    );
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
    await pool.end();
  }
}

async function setCategoryCushionAmount(
  budgetId: string,
  userId: string,
  categoryId: string,
  amountCents: bigint,
  currency: string,
): Promise<void> {
  const pool = new Pool({ connectionString: DB_URL });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `SELECT set_config('app.tenant_ids', '{"${budgetId}"}', true)`,
    );
    await client.query(
      `SELECT set_config('app.current_user_id', '${userId}', true)`,
    );
    // SCD-2: close existing active row, insert new row.
    await client.query(
      `UPDATE budgeting.category_limits
          SET effective_to = CURRENT_DATE
        WHERE tenant_id = $1::uuid
          AND category_id = $2::uuid
          AND effective_to IS NULL`,
      [budgetId, categoryId],
    );
    await client.query(
      `INSERT INTO budgeting.category_limits
         (id, tenant_id, category_id,
          normal_amount, normal_currency,
          cushion_amount, cushion_currency,
          cushion_amount_cents,
          effective_from, effective_to, actor_user_id, created_at)
       VALUES (gen_random_uuid(), $1, $2,
               0, $3,
               $4, $3,
               $4,
               CURRENT_DATE - INTERVAL '1 day', NULL, $5, now())`,
      [budgetId, categoryId, currency, amountCents.toString(), userId],
    );
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
    await pool.end();
  }
}

/* -------------------------------------------------------------------------- */
/* The 9 Nyquist test cases.                                                  */
/* -------------------------------------------------------------------------- */
describe("recompute-cushion-task math", () => {
  it("no emit when cushion_enabled = false", async () => {
    const seeded = await seedBudget({
      cushionEnabled: false,
      cushionTargetMonths: 6,
      defaultCurrency: "EUR",
      categoryCushionCents: 10000n,
      cushionWallets: [{ currency: "EUR", amountCents: 5000n }],
    });

    const fxProvider = stubFxProvider({});
    const summaryFactory = getCushionSummary({ fxProvider });
    const summaryResult = await summaryFactory({
      tenantId: seeded.budgetId,
      budgetId: seeded.budgetId,
    });
    expect(summaryResult.isOk()).toBe(true);
    if (summaryResult.isOk()) {
      expect(summaryResult.value.enabled).toBe(false);
      expect(summaryResult.value.required_cents).toBe("0");
      expect(summaryResult.value.actual_cents).toBe("0");
      expect(summaryResult.value.shortfall_cents).toBe("0");
    }

    const taskRepo = createTaskRepo();
    const r = await withTenantTx(
      TenantId(seeded.budgetId),
      UserId(seeded.userId),
      async (tx) => {
        await recomputeCushionTask(
          tx as unknown as {
            execute: (
              q: unknown,
            ) => Promise<{ rows: Record<string, unknown>[] }>;
          },
          { tenantId: seeded.budgetId, budgetId: seeded.budgetId },
          { taskRepo, fxProvider },
        );
      },
    );
    expect(r.isOk()).toBe(true);

    expect(await countPendingCushionTasks(seeded.budgetId)).toBe(0);
  });

  it("emit when cushion_enabled = true AND shortfall > 0", async () => {
    // required = 10000 * 6 = 60000; actual = 5000; shortfall = 55000.
    const seeded = await seedBudget({
      cushionEnabled: true,
      cushionTargetMonths: 6,
      defaultCurrency: "EUR",
      categoryCushionCents: 10000n,
      cushionWallets: [{ currency: "EUR", amountCents: 5000n }],
    });

    const fxProvider = stubFxProvider({});
    const taskRepo = createTaskRepo();
    const r = await withTenantTx(
      TenantId(seeded.budgetId),
      UserId(seeded.userId),
      async (tx) => {
        await recomputeCushionTask(
          tx as unknown as {
            execute: (
              q: unknown,
            ) => Promise<{ rows: Record<string, unknown>[] }>;
          },
          { tenantId: seeded.budgetId, budgetId: seeded.budgetId },
          { taskRepo, fxProvider },
        );
      },
    );
    expect(r.isOk()).toBe(true);

    expect(await countPendingCushionTasks(seeded.budgetId)).toBe(1);
    const payload = await readPendingCushionPayload(seeded.budgetId);
    expect(payload).not.toBeNull();
    expect(payload?.shortfall_cents).toBe("55000");
    expect(payload?.required_cents).toBe("60000");
    expect(payload?.actual_cents).toBe("5000");
    expect(payload?.currency).toBe("EUR");
    expect(payload?.target_months).toBe(6);
  });

  it("no emit when shortfall = 0 (actual ≥ required)", async () => {
    // required = 10000 * 6 = 60000; actual = 70000; shortfall = -10000.
    const seeded = await seedBudget({
      cushionEnabled: true,
      cushionTargetMonths: 6,
      defaultCurrency: "EUR",
      categoryCushionCents: 10000n,
      cushionWallets: [{ currency: "EUR", amountCents: 70000n }],
    });

    const fxProvider = stubFxProvider({});
    const taskRepo = createTaskRepo();
    const r = await withTenantTx(
      TenantId(seeded.budgetId),
      UserId(seeded.userId),
      async (tx) => {
        await recomputeCushionTask(
          tx as unknown as {
            execute: (
              q: unknown,
            ) => Promise<{ rows: Record<string, unknown>[] }>;
          },
          { tenantId: seeded.budgetId, budgetId: seeded.budgetId },
          { taskRepo, fxProvider },
        );
      },
    );
    expect(r.isOk()).toBe(true);

    expect(await countPendingCushionTasks(seeded.budgetId)).toBe(0);
  });

  it("resolve when cushion_enabled toggled off", async () => {
    // Seed with a pending task already, then toggle cushion off and recompute.
    const seeded = await seedBudget({
      cushionEnabled: true,
      cushionTargetMonths: 6,
      defaultCurrency: "EUR",
      categoryCushionCents: 10000n,
      cushionWallets: [{ currency: "EUR", amountCents: 5000n }],
    });
    await seedPendingCushionTask(seeded.budgetId);
    expect(await countPendingCushionTasks(seeded.budgetId)).toBe(1);

    await setBudgetCushionEnabled(seeded.budgetId, false);

    const fxProvider = stubFxProvider({});
    const taskRepo = createTaskRepo();
    const r = await withTenantTx(
      TenantId(seeded.budgetId),
      UserId(seeded.userId),
      async (tx) => {
        await recomputeCushionTask(
          tx as unknown as {
            execute: (
              q: unknown,
            ) => Promise<{ rows: Record<string, unknown>[] }>;
          },
          { tenantId: seeded.budgetId, budgetId: seeded.budgetId },
          { taskRepo, fxProvider },
        );
      },
    );
    expect(r.isOk()).toBe(true);

    expect(await countPendingCushionTasks(seeded.budgetId)).toBe(0);
  });

  it("resolve when shortfall eliminated by adding cushion wallet", async () => {
    // Seed with shortfall, insert pending task, then add a large wallet that
    // takes actual >= required, recompute should resolve.
    const seeded = await seedBudget({
      cushionEnabled: true,
      cushionTargetMonths: 6,
      defaultCurrency: "EUR",
      categoryCushionCents: 10000n,
      cushionWallets: [{ currency: "EUR", amountCents: 5000n }],
    });
    await seedPendingCushionTask(seeded.budgetId);
    expect(await countPendingCushionTasks(seeded.budgetId)).toBe(1);

    // Add a large cushion wallet — actual becomes 5000 + 100000 = 105000 ≥ 60000.
    const pool = new Pool({ connectionString: DB_URL });
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `SELECT set_config('app.tenant_ids', '{"${seeded.budgetId}"}', true)`,
      );
      await client.query(
        `SELECT set_config('app.current_user_id', '${seeded.userId}', true)`,
      );
      await client.query(
        `INSERT INTO budgeting.wallets
           (id, tenant_id, name, currency, current_balance, wallet_type, sort_order, actor_user_id, created_at)
         VALUES (gen_random_uuid(), $1, 'Big Cushion', 'EUR', 1000.0000, 'CUSHION', 1, $2, now())`,
        [seeded.budgetId, seeded.userId],
      );
      await client.query("COMMIT");
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
      await pool.end();
    }

    const fxProvider = stubFxProvider({});
    const taskRepo = createTaskRepo();
    const r = await withTenantTx(
      TenantId(seeded.budgetId),
      UserId(seeded.userId),
      async (tx) => {
        await recomputeCushionTask(
          tx as unknown as {
            execute: (
              q: unknown,
            ) => Promise<{ rows: Record<string, unknown>[] }>;
          },
          { tenantId: seeded.budgetId, budgetId: seeded.budgetId },
          { taskRepo, fxProvider },
        );
      },
    );
    expect(r.isOk()).toBe(true);

    expect(await countPendingCushionTasks(seeded.budgetId)).toBe(0);
  });

  it("FX rate variance: wallet in non-budget currency converts correctly", async () => {
    // EUR budget, EUR category cushion 10000 * 6 = 60000.
    // USD wallet 5000 cents converted at USD->EUR = 0.9 → 4500 cents.
    // shortfall = 60000 - 4500 = 55500.
    const seeded = await seedBudget({
      cushionEnabled: true,
      cushionTargetMonths: 6,
      defaultCurrency: "EUR",
      categoryCushionCents: 10000n,
      cushionWallets: [{ currency: "USD", amountCents: 5000n }],
    });

    const fxProvider = stubFxProvider({ "USD->EUR": 0.9 });
    const summaryFactory = getCushionSummary({ fxProvider });
    const summaryResult = await summaryFactory({
      tenantId: seeded.budgetId,
      budgetId: seeded.budgetId,
    });
    expect(summaryResult.isOk()).toBe(true);
    if (summaryResult.isOk()) {
      expect(summaryResult.value.actual_cents).toBe("4500");
      expect(summaryResult.value.required_cents).toBe("60000");
      expect(summaryResult.value.shortfall_cents).toBe("55500");
      expect(summaryResult.value.currency).toBe("EUR");
      expect(summaryResult.value.enabled).toBe(true);
    }
  });

  it("empty cushion wallets: actual = 0, shortfall = full required amount", async () => {
    const seeded = await seedBudget({
      cushionEnabled: true,
      cushionTargetMonths: 6,
      defaultCurrency: "EUR",
      categoryCushionCents: 10000n,
      cushionWallets: [],
    });

    const fxProvider = stubFxProvider({});
    const summaryFactory = getCushionSummary({ fxProvider });
    const summaryResult = await summaryFactory({
      tenantId: seeded.budgetId,
      budgetId: seeded.budgetId,
    });
    expect(summaryResult.isOk()).toBe(true);
    if (summaryResult.isOk()) {
      expect(summaryResult.value.actual_cents).toBe("0");
      expect(summaryResult.value.required_cents).toBe("60000");
      expect(summaryResult.value.shortfall_cents).toBe("60000");
      expect(summaryResult.value.enabled).toBe(true);
      expect(summaryResult.value.target_months).toBe(6);
    }
  });

  it("cushion_target_months change triggers recompute", async () => {
    // target=6: required=10000*6=60000; actual=60000; shortfall=0 → no emit.
    // Bump target to 12: required=120000; actual=60000; shortfall=60000 → emit.
    const seeded = await seedBudget({
      cushionEnabled: true,
      cushionTargetMonths: 6,
      defaultCurrency: "EUR",
      categoryCushionCents: 10000n,
      cushionWallets: [{ currency: "EUR", amountCents: 60000n }],
    });

    const fxProvider = stubFxProvider({});
    const taskRepo = createTaskRepo();

    // Initial: no shortfall — no task emitted.
    const r1 = await withTenantTx(
      TenantId(seeded.budgetId),
      UserId(seeded.userId),
      async (tx) => {
        await recomputeCushionTask(
          tx as unknown as {
            execute: (
              q: unknown,
            ) => Promise<{ rows: Record<string, unknown>[] }>;
          },
          { tenantId: seeded.budgetId, budgetId: seeded.budgetId },
          { taskRepo, fxProvider },
        );
      },
    );
    expect(r1.isOk()).toBe(true);
    expect(await countPendingCushionTasks(seeded.budgetId)).toBe(0);

    // Bump target_months to 12.
    await setBudgetCushionTargetMonths(seeded.budgetId, 12);

    const r2 = await withTenantTx(
      TenantId(seeded.budgetId),
      UserId(seeded.userId),
      async (tx) => {
        await recomputeCushionTask(
          tx as unknown as {
            execute: (
              q: unknown,
            ) => Promise<{ rows: Record<string, unknown>[] }>;
          },
          { tenantId: seeded.budgetId, budgetId: seeded.budgetId },
          { taskRepo, fxProvider },
        );
      },
    );
    expect(r2.isOk()).toBe(true);
    expect(await countPendingCushionTasks(seeded.budgetId)).toBe(1);
    const payload = await readPendingCushionPayload(seeded.budgetId);
    expect(payload?.shortfall_cents).toBe("60000");
    expect(payload?.required_cents).toBe("120000");
    expect(payload?.actual_cents).toBe("60000");
    expect(payload?.target_months).toBe(12);
  });

  it("category cushion change triggers recompute", async () => {
    // target=6, category cushion 10000 → required=60000.
    // Wallet 100000 EUR → actual=100000; shortfall=-40000 → no emit.
    // Bump category cushion to 20000 → required=120000; shortfall=20000 → emit.
    const seeded = await seedBudget({
      cushionEnabled: true,
      cushionTargetMonths: 6,
      defaultCurrency: "EUR",
      categoryCushionCents: 10000n,
      cushionWallets: [{ currency: "EUR", amountCents: 100000n }],
    });
    expect(seeded.categoryId).not.toBeNull();

    const fxProvider = stubFxProvider({});
    const taskRepo = createTaskRepo();

    const r1 = await withTenantTx(
      TenantId(seeded.budgetId),
      UserId(seeded.userId),
      async (tx) => {
        await recomputeCushionTask(
          tx as unknown as {
            execute: (
              q: unknown,
            ) => Promise<{ rows: Record<string, unknown>[] }>;
          },
          { tenantId: seeded.budgetId, budgetId: seeded.budgetId },
          { taskRepo, fxProvider },
        );
      },
    );
    expect(r1.isOk()).toBe(true);
    expect(await countPendingCushionTasks(seeded.budgetId)).toBe(0);

    // Bump category cushion via a new SCD-2 row (closes the prior one).
    await setCategoryCushionAmount(
      seeded.budgetId,
      seeded.userId,
      seeded.categoryId!,
      20000n,
      "EUR",
    );

    const r2 = await withTenantTx(
      TenantId(seeded.budgetId),
      UserId(seeded.userId),
      async (tx) => {
        await recomputeCushionTask(
          tx as unknown as {
            execute: (
              q: unknown,
            ) => Promise<{ rows: Record<string, unknown>[] }>;
          },
          { tenantId: seeded.budgetId, budgetId: seeded.budgetId },
          { taskRepo, fxProvider },
        );
      },
    );
    expect(r2.isOk()).toBe(true);
    expect(await countPendingCushionTasks(seeded.budgetId)).toBe(1);
    const payload = await readPendingCushionPayload(seeded.budgetId);
    expect(payload?.shortfall_cents).toBe("20000");
    expect(payload?.required_cents).toBe("120000");
    expect(payload?.actual_cents).toBe("100000");
    expect(payload?.target_months).toBe(6);
  });

  it("REFRESHES an already-pending task payload when the shortfall grows (no stale amount)", async () => {
    // Live bug: a CUSHION_BELOW_TARGET task is already PENDING at €5,300, then a
    // category cushion rises → settings recompute €8,900 but the task kept €5,300
    // because emit used ON CONFLICT DO NOTHING. The emit must DO UPDATE the payload.
    // target=9, cushion €800 → required €7,200; wallet €1,900 → shortfall €5,300.
    const seeded = await seedBudget({
      cushionEnabled: true,
      cushionTargetMonths: 9,
      defaultCurrency: "EUR",
      categoryCushionCents: 80000n,
      cushionWallets: [{ currency: "EUR", amountCents: 190000n }],
    });
    expect(seeded.categoryId).not.toBeNull();

    const fxProvider = stubFxProvider({});
    const taskRepo = createTaskRepo();
    const recompute = () =>
      withTenantTx(
        TenantId(seeded.budgetId),
        UserId(seeded.userId),
        async (tx) => {
          await recomputeCushionTask(
            tx as unknown as {
              execute: (
                q: unknown,
              ) => Promise<{ rows: Record<string, unknown>[] }>;
            },
            { tenantId: seeded.budgetId, budgetId: seeded.budgetId },
            { taskRepo, fxProvider },
          );
        },
      );

    await recompute();
    expect(await countPendingCushionTasks(seeded.budgetId)).toBe(1);
    let payload = await readPendingCushionPayload(seeded.budgetId);
    expect(payload?.shortfall_cents).toBe("530000"); // €5,300

    // Raise the category cushion €800 → €1,200: required €10,800, shortfall €8,900.
    await setCategoryCushionAmount(
      seeded.budgetId,
      seeded.userId,
      seeded.categoryId!,
      120000n,
      "EUR",
    );
    await recompute();

    expect(await countPendingCushionTasks(seeded.budgetId)).toBe(1); // still one
    payload = await readPendingCushionPayload(seeded.budgetId);
    expect(payload?.shortfall_cents).toBe("890000"); // REFRESHED €8,900, NOT stale €5,300
    expect(payload?.required_cents).toBe("1080000");
  });
});

// Silence unused-import warnings for symbols exercised indirectly via deps.
void computeCushionSummary;
