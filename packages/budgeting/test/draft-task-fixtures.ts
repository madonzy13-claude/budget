/**
 * draft-task-fixtures.ts — shared seed/read helpers for the 260612-kxd
 * orphan CONFIRM_DRAFT tests (T3-A/B/C/D).
 *
 * Real Postgres via DATABASE_URL_APP (CLAUDE.md rule 3 — no DB mocking).
 * Callers rewrite "@db:" → "@localhost:" at module load before importing.
 *
 * RLS gotcha (codified in 07-03 cushion-math.test.ts): set_config(..., true)
 * is transaction-local; every raw pg.Pool helper MUST wrap its SELECT/INSERT
 * inside BEGIN/COMMIT or the GUC resets between auto-commit statements and
 * RLS filters every row.
 */
import { Pool, type PoolClient } from "pg";

function dbUrl(): string {
  const raw = process.env.DATABASE_URL_APP;
  if (!raw) throw new Error("DATABASE_URL_APP required for draft-task fixtures");
  return raw;
}

async function withRlsClient<T>(
  tenantId: string,
  userId: string,
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const pool = new Pool({ connectionString: dbUrl() });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `SELECT set_config('app.tenant_ids', '{"${tenantId}"}', true)`,
    );
    await client.query(
      `SELECT set_config('app.current_user_id', '${userId}', true)`,
    );
    const out = await fn(client);
    await client.query("COMMIT");
    return out;
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
    await pool.end();
  }
}

export interface DraftTaskFixture {
  userId: string;
  /** v1.1 invariant: budgetId === tenantId. */
  budgetId: string;
  categoryId: string;
  ruleId: string;
  /** The draft the CONFIRM_DRAFT task points at. When `orphan: true` this
   *  draft row was NEVER inserted — only the task references it. */
  draftId: string;
  taskId: string;
}

/**
 * Seed a fresh user + budget + category (+ recurring rule + unconfirmed
 * draft unless `orphan`) + one PENDING CONFIRM_DRAFT task whose
 * payload_json->>'draft_id' points at the draft.
 */
export async function seedDraftWithTask(opts?: {
  /** Set archived_at/archived_from on the category (hard-delete UI precondition). */
  archivedCategory?: boolean;
  /** Skip the draft row INSERT — task points at a non-existent draft (Maczfit shape). */
  orphan?: boolean;
}): Promise<DraftTaskFixture> {
  const userId = crypto.randomUUID();
  const budgetId = crypto.randomUUID();
  const categoryId = crypto.randomUUID();
  const ruleId = crypto.randomUUID();
  const draftId = crypto.randomUUID();
  const taskId = crypto.randomUUID();
  const dueDate = new Date().toISOString().slice(0, 10);
  const amountCents = "35000";
  const currency = "EUR";

  await withRlsClient(budgetId, userId, async (client) => {
    await client.query(
      `INSERT INTO identity.users (id, email, name, email_verified, created_at, updated_at)
       VALUES ($1, $2, 'Orphan Fixture User', true, now(), now())`,
      [userId, `kxd-orphan-${userId.slice(0, 8)}@example.com`],
    );
    await client.query(
      `INSERT INTO tenancy.budgets
         (id, slug, name, kind, default_currency, owner_user_id, member_count, created_at)
       VALUES ($1, $2, 'Orphan Fixture Budget', 'PRIVATE', $3, $4, 1, now())`,
      [budgetId, `ws-kxd-${budgetId.slice(0, 8)}`, currency, userId],
    );
    await client.query(
      `INSERT INTO tenancy.budget_members (id, budget_id, user_id, role, created_at)
       VALUES ($1, $2, $3, 'owner', now())`,
      [crypto.randomUUID(), budgetId, userId],
    );
    await client.query(
      `INSERT INTO budgeting.categories
         (id, tenant_id, name, sort_index, reserve_excluded, actor_user_id, created_at,
          archived_at, archived_from)
       VALUES ($1, $2, 'Maczfit Fixture', 0, false, $3, now(),
               ${opts?.archivedCategory ? "now()" : "NULL"},
               ${opts?.archivedCategory ? "date_trunc('month', now())" : "NULL"})`,
      [categoryId, budgetId, userId],
    );
    await client.query(
      `INSERT INTO budgeting.recurring_rules
         (id, tenant_id, category_id, amount, currency, cadence, cadence_anchor, weekly_dow,
          note, active, next_due_date, actor_user_id, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, 'MONTHLY', 15, NULL, 'Maczfit', true, $6::date, $7, now(), now())`,
      [
        ruleId,
        budgetId,
        categoryId,
        (Number(amountCents) / 100).toFixed(4),
        currency,
        dueDate,
        userId,
      ],
    );
    if (!opts?.orphan) {
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
        [draftId, budgetId, categoryId, dueDate, amountCents, currency, ruleId],
      );
    }
    const payload = {
      draft_id: draftId,
      rule_name: "Maczfit",
      amount_cents: amountCents,
      currency,
      transaction_date: dueDate,
      category_id: categoryId,
    };
    await client.query(
      `INSERT INTO budgeting.tasks
         (id, tenant_id, budget_id, kind, payload_json, status, created_at)
       VALUES ($1, $2, $2, 'CONFIRM_DRAFT', $3::jsonb, 'PENDING', now())`,
      [taskId, budgetId, JSON.stringify(payload)],
    );
  });

  return { userId, budgetId, categoryId, ruleId, draftId, taskId };
}

/** Seed a PENDING RESERVE_TOPUP task (no draft_id payload) for over-filter guards. */
export async function seedReserveTopupTask(
  fx: Pick<DraftTaskFixture, "budgetId" | "userId">,
): Promise<{ taskId: string }> {
  const taskId = crypto.randomUUID();
  await withRlsClient(fx.budgetId, fx.userId, async (client) => {
    await client.query(
      `INSERT INTO budgeting.tasks
         (id, tenant_id, budget_id, kind, payload_json, status, created_at)
       VALUES ($1, $2, $2, 'RESERVE_TOPUP', $3::jsonb, 'PENDING', now())`,
      [taskId, fx.budgetId, JSON.stringify({ shortfall_cents: "1000", currency: "EUR" })],
    );
  });
  return { taskId };
}

/** Flip a lifecycle column on the draft (deleted_at | dismissed_at | confirmed_at). */
export async function markDraft(
  fx: Pick<DraftTaskFixture, "budgetId" | "userId" | "draftId">,
  column: "deleted_at" | "dismissed_at" | "confirmed_at",
): Promise<void> {
  await withRlsClient(fx.budgetId, fx.userId, async (client) => {
    await client.query(
      `UPDATE budgeting.expense_ledger
          SET ${column} = now(), updated_at = now()
        WHERE id = $1::uuid AND tenant_id = $2::uuid`,
      [fx.draftId, fx.budgetId],
    );
  });
}

/** Read task status by id (any status). Null when RLS hides / missing. */
export async function readTaskStatus(
  budgetId: string,
  taskId: string,
): Promise<{ status: string; resolved_at: unknown } | null> {
  return withRlsClient(budgetId, budgetId, async (client) => {
    const r = await client.query(
      `SELECT status, resolved_at FROM budgeting.tasks
        WHERE id = $1::uuid AND budget_id = $2::uuid LIMIT 1`,
      [taskId, budgetId],
    );
    if (r.rows.length === 0) return null;
    return {
      status: r.rows[0].status as string,
      resolved_at: r.rows[0].resolved_at,
    };
  });
}

/** Whether the expense_ledger row still exists (hard-delete check). */
export async function draftRowExists(
  budgetId: string,
  draftId: string,
): Promise<boolean> {
  return withRlsClient(budgetId, budgetId, async (client) => {
    const r = await client.query(
      `SELECT 1 FROM budgeting.expense_ledger
        WHERE id = $1::uuid AND tenant_id = $2::uuid LIMIT 1`,
      [draftId, budgetId],
    );
    return r.rows.length > 0;
  });
}
