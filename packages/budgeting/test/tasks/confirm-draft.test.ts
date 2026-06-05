/**
 * confirm-draft.test.ts — CONFIRM_DRAFT generator integration tests.
 *
 * Phase 7 Plan 04 (Wave 2 GREEN of Wave 0 scaffold).
 *
 * Nyquist 6-case coverage per 07-VALIDATION.md § "Minimum Test Cases per Kind":
 *   1. emits on fresh draft INSERT (recurring-engine handler)
 *   2. does NOT emit on conflict (draft already existed for that rule+date)
 *   3. resolves on confirmRecurringDraft
 *   4. resolves on dismissDraft
 *   5. resolves on skipRecurringDraft
 *   6. dedup: two rapid confirms do not throw (idempotent resolve)
 *
 * Tests use real Postgres (DATABASE_URL_APP) per CLAUDE.md rule 3 (no DB
 * mocking in integration tests). Each test seeds its own fresh budget +
 * user + rule with random UUIDs — no cross-test cleanup needed.
 *
 * RLS gotcha (codified in 07-03 cushion-math.test.ts): set_config(..., true)
 * is transaction-local; every raw pg.Pool helper MUST wrap its SELECT/INSERT
 * inside BEGIN/COMMIT or the GUC resets between auto-commit statements and
 * RLS filters every row.
 */
import { describe, it, expect } from "bun:test";
import { Pool } from "pg";

const DB_URL_RAW = process.env.DATABASE_URL_APP;
if (!DB_URL_RAW) {
  throw new Error(
    "DATABASE_URL_APP required for confirm-draft generator tests",
  );
}
process.env.DATABASE_URL_APP = DB_URL_RAW.replace("@db:", "@localhost:");
const DB_URL = process.env.DATABASE_URL_APP;
// Worker tests connect via DATABASE_URL_WORKER for the worker_role scan.
if (process.env.DATABASE_URL_WORKER) {
  process.env.DATABASE_URL_WORKER = process.env.DATABASE_URL_WORKER.replace(
    "@db:",
    "@localhost:",
  );
}

const { resetPools } = await import("@budget/platform");
const { createTaskRepo } =
  await import("@budget/budgeting/src/adapters/persistence/task-repo");
const { confirmRecurringDraft } =
  await import("@budget/budgeting/src/application/confirm-recurring-draft");
const { dismissDraft } =
  await import("@budget/budgeting/src/application/dismiss-draft");
const { skipRecurringDraft } =
  await import("@budget/budgeting/src/application/skip-recurring-draft");
const { DrizzleExpenseLedgerDraftPortRepo } =
  await import("@budget/budgeting/src/adapters/persistence/expense-ledger-draft-port-repo");
// Relative cross-app import: the recurring-engine handler lives in apps/worker
// and is the system-under-test for cases 1 & 2 (emit-on-fresh-INSERT path).
// Acceptable for an integration test that explicitly exercises the engine
// + adapter wiring per VALIDATION.md case 1.
const { runRecurringEngine } =
  await import("../../../../apps/worker/src/handlers/recurring-engine");
resetPools();

/* -------------------------------------------------------------------------- */
/* Seed helpers — all wrap their SELECT/INSERT in BEGIN/COMMIT so the         */
/* set_config(..., true) GUC remains visible for the duration of the query.   */
/* -------------------------------------------------------------------------- */

interface SeededRule {
  userId: string;
  budgetId: string;
  ruleId: string;
  categoryId: string;
  /** YYYY-MM-DD — the rule's next_due_date at seed time. */
  dueDate: string;
  /** Amount in cents (numeric(19,4) * 100 stored as bigint). */
  amountCents: string;
  /** ISO 4217 (e.g. "EUR"). */
  currency: string;
  /** rule.note value used as CONFIRM_DRAFT.rule_name fallback. */
  noteAsRuleName: string;
}

/**
 * Seed a fresh budget + user + recurring rule, due TODAY. v1.1 invariant
 * budgetId === tenantId so the engine's loop will pick up the rule.
 */
async function seedBudgetWithRule(opts?: {
  dueDate?: string;
  amountCents?: string;
  currency?: string;
  ruleNote?: string;
}): Promise<SeededRule> {
  const pool = new Pool({ connectionString: DB_URL });
  const client = await pool.connect();
  const userId = crypto.randomUUID();
  const budgetId = crypto.randomUUID();
  const categoryId = crypto.randomUUID();
  const ruleId = crypto.randomUUID();
  const dueDate = opts?.dueDate ?? new Date().toISOString().slice(0, 10);
  const amountCents = opts?.amountCents ?? "12345";
  const currency = opts?.currency ?? "EUR";
  // numeric(19,4) on the rule.amount column — convert cents → major units.
  const amountMajor = (Number(amountCents) / 100).toFixed(4);
  const noteAsRuleName = opts?.ruleNote ?? "Test Recurring Rule";

  try {
    await client.query("BEGIN");
    await client.query(
      `SELECT set_config('app.tenant_ids', '{"${budgetId}"}', true)`,
    );
    await client.query(
      `SELECT set_config('app.current_user_id', '${userId}', true)`,
    );

    await client.query(
      `INSERT INTO identity.users (id, email, name, email_verified, created_at, updated_at)
       VALUES ($1, $2, 'Confirm Draft Test', true, now(), now())`,
      [userId, `confirm-draft-${userId.slice(0, 8)}@example.com`],
    );

    await client.query(
      `INSERT INTO tenancy.budgets
         (id, slug, name, kind, default_currency, owner_user_id, member_count, created_at)
       VALUES ($1, $2, 'Confirm Draft Budget', 'PRIVATE', $3, $4, 1, now())`,
      [budgetId, `ws-cdt-${budgetId.slice(0, 8)}`, currency, userId],
    );

    await client.query(
      `INSERT INTO tenancy.budget_members (id, budget_id, user_id, role, created_at)
       VALUES ($1, $2, $3, 'owner', now())`,
      [crypto.randomUUID(), budgetId, userId],
    );

    await client.query(
      `INSERT INTO budgeting.categories
         (id, tenant_id, name, sort_index, reserve_excluded, actor_user_id, created_at)
       VALUES ($1, $2, 'Test Category', 0, false, $3, now())`,
      [categoryId, budgetId, userId],
    );

    // Single recurring rule, due TODAY, mapped to the seeded category.
    await client.query(
      `INSERT INTO budgeting.recurring_rules
         (id, tenant_id, category_id, amount, currency, cadence, cadence_anchor, weekly_dow,
          note, active, next_due_date, actor_user_id, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, 'MONTHLY', 15, NULL, $6, true, $7::date, $8, now(), now())`,
      [
        ruleId,
        budgetId,
        categoryId,
        amountMajor,
        currency,
        noteAsRuleName,
        dueDate,
        userId,
      ],
    );

    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
    await pool.end();
  }

  return {
    userId,
    budgetId,
    ruleId,
    categoryId,
    dueDate,
    amountCents,
    currency,
    noteAsRuleName,
  };
}

/** Direct INSERT of an expense_ledger draft row (for resolve-only tests). */
async function seedDraftRowDirect(
  seeded: SeededRule,
): Promise<{ draftId: string }> {
  const pool = new Pool({ connectionString: DB_URL });
  const client = await pool.connect();
  const draftId = crypto.randomUUID();
  try {
    await client.query("BEGIN");
    await client.query(
      `SELECT set_config('app.tenant_ids', '{"${seeded.budgetId}"}', true)`,
    );
    await client.query(
      `SELECT set_config('app.current_user_id', '${seeded.userId}', true)`,
    );
    await client.query(
      `INSERT INTO budgeting.expense_ledger
         (id, tenant_id, budget_id, category_id, transaction_date,
          amount_original_cents, currency_original,
          amount_converted_cents, fx_rate, fx_as_of,
          note, recurring_rule_id, confirmed_at, kind, created_at, updated_at)
       VALUES ($1, $2, $2, $3, $4::date,
               $5::bigint, $6,
               $5::bigint, '1'::numeric, $4::date,
               NULL, $7, NULL, 'SPENDING', now(), now())`,
      [
        draftId,
        seeded.budgetId,
        seeded.categoryId,
        seeded.dueDate,
        seeded.amountCents,
        seeded.currency,
        seeded.ruleId,
      ],
    );
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
    await pool.end();
  }
  return { draftId };
}

/** Direct INSERT of a PENDING CONFIRM_DRAFT task for the given draft. */
async function seedPendingConfirmDraftTask(
  seeded: SeededRule,
  draftId: string,
): Promise<{ taskId: string }> {
  const pool = new Pool({ connectionString: DB_URL });
  const client = await pool.connect();
  const taskId = crypto.randomUUID();
  const payload = {
    draft_id: draftId,
    rule_name: seeded.noteAsRuleName,
    amount_cents: seeded.amountCents,
    currency: seeded.currency,
    transaction_date: seeded.dueDate,
    category_id: seeded.categoryId,
  };
  try {
    await client.query("BEGIN");
    await client.query(
      `SELECT set_config('app.tenant_ids', '{"${seeded.budgetId}"}', true)`,
    );
    await client.query(
      `SELECT set_config('app.current_user_id', '${seeded.userId}', true)`,
    );
    await client.query(
      `INSERT INTO budgeting.tasks
         (id, tenant_id, budget_id, kind, payload_json, status, created_at)
       VALUES ($1, $2, $2, 'CONFIRM_DRAFT', $3::jsonb, 'PENDING', now())`,
      [taskId, seeded.budgetId, JSON.stringify(payload)],
    );
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
    await pool.end();
  }
  return { taskId };
}

/** Count PENDING CONFIRM_DRAFT tasks for the budget (RLS-scoped read). */
async function countPendingConfirmDraftTasks(
  budgetId: string,
): Promise<number> {
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
    const r = await client.query(
      `SELECT COUNT(*)::int AS cnt
         FROM budgeting.tasks
        WHERE budget_id = $1::uuid
          AND kind = 'CONFIRM_DRAFT'
          AND status = 'PENDING'`,
      [budgetId],
    );
    await client.query("COMMIT");
    return (r.rows[0]?.cnt as number) ?? 0;
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
    await pool.end();
  }
}

/** Read the single PENDING CONFIRM_DRAFT payload for assertion. */
async function readPendingConfirmDraftPayload(
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
    const r = await client.query(
      `SELECT payload_json
         FROM budgeting.tasks
        WHERE budget_id = $1::uuid
          AND kind = 'CONFIRM_DRAFT'
          AND status = 'PENDING'
        LIMIT 1`,
      [budgetId],
    );
    await client.query("COMMIT");
    if (r.rows.length === 0) return null;
    return r.rows[0].payload_json as Record<string, unknown>;
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
    await pool.end();
  }
}

/** Read task status by id (any status). */
async function readTaskStatus(
  budgetId: string,
  taskId: string,
): Promise<{ status: string; resolved_at: unknown } | null> {
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
    const r = await client.query(
      `SELECT status, resolved_at
         FROM budgeting.tasks
        WHERE id = $1::uuid AND budget_id = $2::uuid
        LIMIT 1`,
      [taskId, budgetId],
    );
    await client.query("COMMIT");
    if (r.rows.length === 0) return null;
    return {
      status: r.rows[0].status as string,
      resolved_at: r.rows[0].resolved_at,
    };
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
    await pool.end();
  }
}

/* -------------------------------------------------------------------------- */
/* The 6 Nyquist test cases.                                                  */
/* -------------------------------------------------------------------------- */
describe("CONFIRM_DRAFT generator", () => {
  it("emits on fresh draft INSERT (recurring-engine handler)", async () => {
    const seeded = await seedBudgetWithRule({});

    const r = await runRecurringEngine({ todayOverride: seeded.dueDate });
    expect(r.isOk()).toBe(true);

    expect(await countPendingConfirmDraftTasks(seeded.budgetId)).toBe(1);

    const payload = await readPendingConfirmDraftPayload(seeded.budgetId);
    expect(payload).not.toBeNull();
    expect(payload?.draft_id).toBeDefined();
    expect(typeof payload?.draft_id).toBe("string");
    expect(payload?.rule_name).toBe(seeded.noteAsRuleName);
    expect(payload?.amount_cents).toBe(seeded.amountCents);
    expect(payload?.currency).toBe(seeded.currency);
    expect(payload?.transaction_date).toBe(seeded.dueDate);
    expect(payload?.category_id).toBe(seeded.categoryId);
  });

  it("does not emit on conflict (draft already existed for that rule+date)", async () => {
    const seeded = await seedBudgetWithRule({});
    // Pre-seed the draft row so the engine's ON CONFLICT DO NOTHING fires —
    // insertResult.rows.length will be 0 and the emit gate (Pitfall 3) skips.
    await seedDraftRowDirect(seeded);

    expect(await countPendingConfirmDraftTasks(seeded.budgetId)).toBe(0);

    const r = await runRecurringEngine({ todayOverride: seeded.dueDate });
    expect(r.isOk()).toBe(true);

    // Engine saw 0 rows from RETURNING → did NOT emit. No task created.
    expect(await countPendingConfirmDraftTasks(seeded.budgetId)).toBe(0);
  });

  it("resolves on confirmRecurringDraft", async () => {
    const seeded = await seedBudgetWithRule({});
    const { draftId } = await seedDraftRowDirect(seeded);
    const { taskId } = await seedPendingConfirmDraftTask(seeded, draftId);

    expect(await countPendingConfirmDraftTasks(seeded.budgetId)).toBe(1);

    const taskRepo = createTaskRepo();
    const confirm = confirmRecurringDraft({ taskRepo });
    const r = await confirm({
      tenantId: seeded.budgetId,
      draftId,
      actorUserId: seeded.userId,
    });
    expect(r.isOk()).toBe(true);

    const status = await readTaskStatus(seeded.budgetId, taskId);
    expect(status?.status).toBe("RESOLVED");
    expect(status?.resolved_at).not.toBeNull();
    expect(await countPendingConfirmDraftTasks(seeded.budgetId)).toBe(0);
  });

  it("resolves on dismissDraft", async () => {
    const seeded = await seedBudgetWithRule({});
    const { draftId } = await seedDraftRowDirect(seeded);
    const { taskId } = await seedPendingConfirmDraftTask(seeded, draftId);

    expect(await countPendingConfirmDraftTasks(seeded.budgetId)).toBe(1);

    const taskRepo = createTaskRepo();
    const repo = new DrizzleExpenseLedgerDraftPortRepo();
    const dismiss = dismissDraft({ repo, taskRepo });
    const r = await dismiss({
      tenantId: seeded.budgetId,
      draftId,
      actorUserId: seeded.userId,
    });
    expect(r.isOk()).toBe(true);

    const status = await readTaskStatus(seeded.budgetId, taskId);
    expect(status?.status).toBe("RESOLVED");
    expect(status?.resolved_at).not.toBeNull();
    expect(await countPendingConfirmDraftTasks(seeded.budgetId)).toBe(0);
  });

  it("resolves on skipRecurringDraft", async () => {
    const seeded = await seedBudgetWithRule({});
    const { draftId } = await seedDraftRowDirect(seeded);
    const { taskId } = await seedPendingConfirmDraftTask(seeded, draftId);

    expect(await countPendingConfirmDraftTasks(seeded.budgetId)).toBe(1);

    const taskRepo = createTaskRepo();
    const skip = skipRecurringDraft({ taskRepo });
    const r = await skip({
      tenantId: seeded.budgetId,
      draftId,
      actorUserId: seeded.userId,
    });
    expect(r.isOk()).toBe(true);

    const status = await readTaskStatus(seeded.budgetId, taskId);
    expect(status?.status).toBe("RESOLVED");
    expect(status?.resolved_at).not.toBeNull();
    expect(await countPendingConfirmDraftTasks(seeded.budgetId)).toBe(0);
  });

  it("dedup: two rapid confirms do not throw (idempotent resolve)", async () => {
    const seeded = await seedBudgetWithRule({});
    const { draftId } = await seedDraftRowDirect(seeded);
    const { taskId } = await seedPendingConfirmDraftTask(seeded, draftId);

    const taskRepo = createTaskRepo();
    const confirm = confirmRecurringDraft({ taskRepo });

    // First confirm: should succeed and resolve the task.
    const r1 = await confirm({
      tenantId: seeded.budgetId,
      draftId,
      actorUserId: seeded.userId,
    });
    expect(r1.isOk()).toBe(true);

    const status1 = await readTaskStatus(seeded.budgetId, taskId);
    expect(status1?.status).toBe("RESOLVED");

    // Second confirm: returns AlreadyConfirmed (draft.confirmed_at IS NOT
    // NULL after the first call) — that's a domain-level err Result, NOT a
    // throw. The task itself stays RESOLVED (idempotent UPDATE WHERE
    // status='PENDING' is a 0-row no-op).
    const r2 = await confirm({
      tenantId: seeded.budgetId,
      draftId,
      actorUserId: seeded.userId,
    });
    // Second call returns err with AlreadyConfirmedError — system did not
    // throw an unhandled exception (which would have surfaced here).
    expect(r2.isErr()).toBe(true);

    const status2 = await readTaskStatus(seeded.budgetId, taskId);
    expect(status2?.status).toBe("RESOLVED");
    expect(await countPendingConfirmDraftTasks(seeded.budgetId)).toBe(0);
  });
});
