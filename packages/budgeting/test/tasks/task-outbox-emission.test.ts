/**
 * task-outbox-emission.test.ts — Phase 8 Plan 02 (PWAX-05).
 *
 * Verifies that every real task INSERT emits exactly one `task.created` row
 * into shared_kernel.outbox — and that the idempotent ON CONFLICT path does
 * NOT double-emit a second outbox row.
 *
 * Mirrors the harness in resolve-idempotency.test.ts:
 *   - Real Postgres (no mocking)
 *   - seedBudget / withTenantTx pattern
 *   - GUC set inside transaction so RLS is active
 */
import { describe, it, expect, beforeAll } from "bun:test";
import { Pool } from "pg";

const DB_URL_RAW = process.env.DATABASE_URL_APP;
if (!DB_URL_RAW) {
  throw new Error("DATABASE_URL_APP required for task-outbox-emission tests");
}
process.env.DATABASE_URL_APP = DB_URL_RAW.replace("@db:", "@localhost:");
const DB_URL = process.env.DATABASE_URL_APP;

// app_role has INSERT-only on shared_kernel.outbox (worker_role holds SELECT).
// Reading the emitted rows back requires the worker connection.
const WORKER_URL_RAW = process.env.DATABASE_URL_WORKER;
const WORKER_URL = WORKER_URL_RAW
  ? WORKER_URL_RAW.replace("@db:", "@localhost:")
  : DB_URL;

const { resetPools, withTenantTx } = await import("@budget/platform");
const { TenantId, UserId } = await import("@budget/shared-kernel");
const { createTaskRepo } =
  await import("@budget/budgeting/src/adapters/persistence/task-repo");
resetPools();

interface SeededBudget {
  userId: string;
  budgetId: string;
}

async function seedBudget(): Promise<SeededBudget> {
  const pool = new Pool({ connectionString: DB_URL });
  const client = await pool.connect();
  const userId = crypto.randomUUID();
  const budgetId = crypto.randomUUID();
  try {
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO identity.users (id, email, name, email_verified, created_at, updated_at)
       VALUES ($1, $2, 'Outbox Emit', true, now(), now())`,
      [userId, `outbox-emit-${userId.slice(0, 8)}@example.com`],
    );
    await client.query(
      `INSERT INTO tenancy.budgets
         (id, slug, name, kind, default_currency, owner_user_id, member_count, created_at)
       VALUES ($1, $2, 'Outbox Emit Budget', 'PRIVATE', 'EUR', $3, 1, now())`,
      [budgetId, `ws-oe-${budgetId.slice(0, 8)}`, userId],
    );
    await client.query(
      `INSERT INTO tenancy.budget_members (id, budget_id, user_id, role, created_at)
       VALUES ($1, $2, $3, 'owner', now())`,
      [crypto.randomUUID(), budgetId, userId],
    );
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
    await pool.end();
  }
  return { userId, budgetId };
}

/** Read outbox rows for a given aggregate_id (taskId) and event_type. */
async function readOutboxRows(
  aggregateId: string,
): Promise<Array<{ event_type: string; payload: Record<string, unknown> }>> {
  const pool = new Pool({ connectionString: WORKER_URL });
  const client = await pool.connect();
  try {
    const result = await client.query(
      `SELECT event_type, payload_jsonb AS payload
         FROM shared_kernel.outbox
        WHERE aggregate_id = $1
        ORDER BY created_at ASC`,
      [aggregateId],
    );
    return result.rows.map((r) => ({
      event_type: r.event_type as string,
      payload:
        typeof r.payload === "string"
          ? (JSON.parse(r.payload) as Record<string, unknown>)
          : (r.payload as Record<string, unknown>),
    }));
  } finally {
    client.release();
    await pool.end();
  }
}

/** Find the PENDING task row for a budget+kind, scoped with tenant GUC. */
async function findPendingTaskId(
  budgetId: string,
  kind: string,
): Promise<string | undefined> {
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
      `SELECT id FROM budgeting.tasks
        WHERE budget_id = $1::uuid AND kind = $2 AND status = 'PENDING'
        ORDER BY created_at DESC LIMIT 1`,
      [budgetId, kind],
    );
    await client.query("COMMIT");
    return result.rows[0]?.id as string | undefined;
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
    await pool.end();
  }
}

describe("task-repo — task.created outbox emission", () => {
  let budget: SeededBudget;

  beforeAll(async () => {
    budget = await seedBudget();
  });

  it("emitReserveTopup emits one task.created outbox row with kind=RESERVE_TOPUP", async () => {
    const repo = createTaskRepo();

    const r = await withTenantTx(
      TenantId(budget.budgetId),
      UserId(budget.userId),
      async (tx) => {
        const typedTx = tx as unknown as {
          execute: (q: unknown) => Promise<{ rows: Record<string, unknown>[] }>;
        };
        await repo.emitReserveTopup(
          budget.budgetId,
          budget.budgetId,
          {
            kind: "RESERVE_TOPUP",
            shortfall_cents: 5000,
            currency: "EUR",
          } as unknown as import("@budget/budgeting/src/ports/task-repo").ReserveTopupPayload,
          typedTx,
        );
      },
    );
    expect(r.isOk()).toBe(true);

    const taskId = await findPendingTaskId(budget.budgetId, "RESERVE_TOPUP");
    expect(taskId).toBeDefined();

    const rows = await readOutboxRows(taskId!);
    expect(rows).toHaveLength(1);
    expect(rows[0].event_type).toBe("task.created");
    expect((rows[0].payload as Record<string, unknown>).kind).toBe(
      "RESERVE_TOPUP",
    );
  });

  it("emitConfirmDraft emits one task.created outbox row with kind=CONFIRM_DRAFT", async () => {
    const repo = createTaskRepo();
    const draftId = crypto.randomUUID();

    const r = await withTenantTx(
      TenantId(budget.budgetId),
      UserId(budget.userId),
      async (tx) => {
        const typedTx = tx as unknown as {
          execute: (q: unknown) => Promise<{ rows: Record<string, unknown>[] }>;
        };
        await repo.emitConfirmDraft(
          budget.budgetId,
          budget.budgetId,
          {
            kind: "CONFIRM_DRAFT",
            draft_id: draftId,
            rule_name: "Rent",
            amount_cents: "120000",
            currency: "EUR",
            transaction_date: "2026-06-01",
            category_id: crypto.randomUUID(),
          } as unknown as import("@budget/budgeting/src/ports/task-repo").ConfirmDraftPayload,
          typedTx,
        );
      },
    );
    expect(r.isOk()).toBe(true);

    const taskId = await findPendingTaskId(budget.budgetId, "CONFIRM_DRAFT");
    expect(taskId).toBeDefined();

    const rows = await readOutboxRows(taskId!);
    expect(rows).toHaveLength(1);
    expect(rows[0].event_type).toBe("task.created");
    expect((rows[0].payload as Record<string, unknown>).kind).toBe(
      "CONFIRM_DRAFT",
    );
  });

  it("emitCushionBelowTarget emits one task.created outbox row with kind=CUSHION_BELOW_TARGET", async () => {
    const repo = createTaskRepo();
    // Fresh budget so no conflicting PENDING CUSHION_BELOW_TARGET
    const freshBudget = await seedBudget();

    const r = await withTenantTx(
      TenantId(freshBudget.budgetId),
      UserId(freshBudget.userId),
      async (tx) => {
        const typedTx = tx as unknown as {
          execute: (q: unknown) => Promise<{ rows: Record<string, unknown>[] }>;
        };
        await repo.emitCushionBelowTarget(
          freshBudget.budgetId,
          freshBudget.budgetId,
          {
            kind: "CUSHION_BELOW_TARGET",
            shortfall_cents: 3000,
            currency: "EUR",
          } as unknown as import("@budget/budgeting/src/ports/task-repo").CushionBelowTargetPayload,
          typedTx,
        );
      },
    );
    expect(r.isOk()).toBe(true);

    const taskId = await findPendingTaskId(
      freshBudget.budgetId,
      "CUSHION_BELOW_TARGET",
    );
    expect(taskId).toBeDefined();

    const rows = await readOutboxRows(taskId!);
    expect(rows).toHaveLength(1);
    expect(rows[0].event_type).toBe("task.created");
    expect((rows[0].payload as Record<string, unknown>).kind).toBe(
      "CUSHION_BELOW_TARGET",
    );
  });

  it("idempotent re-emit (same dedup key) does NOT add a second outbox row", async () => {
    const repo = createTaskRepo();
    // Fresh budget to ensure clean slate
    const freshBudget = await seedBudget();

    // First emit
    const r1 = await withTenantTx(
      TenantId(freshBudget.budgetId),
      UserId(freshBudget.userId),
      async (tx) => {
        const typedTx = tx as unknown as {
          execute: (q: unknown) => Promise<{ rows: Record<string, unknown>[] }>;
        };
        await repo.emitCushionBelowTarget(
          freshBudget.budgetId,
          freshBudget.budgetId,
          {
            kind: "CUSHION_BELOW_TARGET",
            shortfall_cents: 1000,
            currency: "EUR",
          } as unknown as import("@budget/budgeting/src/ports/task-repo").CushionBelowTargetPayload,
          typedTx,
        );
      },
    );
    expect(r1.isOk()).toBe(true);

    const taskId = await findPendingTaskId(
      freshBudget.budgetId,
      "CUSHION_BELOW_TARGET",
    );
    expect(taskId).toBeDefined();

    const after1 = await readOutboxRows(taskId!);
    expect(after1).toHaveLength(1);

    // Second emit — same budget = same dedup key → DO UPDATE (payload refresh, NOT a new row)
    const r2 = await withTenantTx(
      TenantId(freshBudget.budgetId),
      UserId(freshBudget.userId),
      async (tx) => {
        const typedTx = tx as unknown as {
          execute: (q: unknown) => Promise<{ rows: Record<string, unknown>[] }>;
        };
        await repo.emitCushionBelowTarget(
          freshBudget.budgetId,
          freshBudget.budgetId,
          {
            kind: "CUSHION_BELOW_TARGET",
            shortfall_cents: 2000,
            currency: "EUR",
          } as unknown as import("@budget/budgeting/src/ports/task-repo").CushionBelowTargetPayload,
          typedTx,
        );
      },
    );
    expect(r2.isOk()).toBe(true);

    // The original task still has only 1 outbox row — no duplicate
    const after2 = await readOutboxRows(taskId!);
    expect(after2).toHaveLength(1);
  });
});
