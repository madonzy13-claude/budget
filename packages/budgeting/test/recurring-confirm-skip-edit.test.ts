/**
 * recurring-confirm-skip-edit.test.ts — Integration tests for draft confirm/skip/edit-confirm.
 * Requires Postgres at localhost:5432 (run with infisical wrapper).
 */
import { describe, test, expect, beforeAll } from "bun:test";
import { Pool } from "pg";
import { withTenantTx, withInfraTx } from "@budget/platform";
import { TenantId, UserId } from "@budget/shared-kernel";
import { sql } from "drizzle-orm";
import { confirmRecurringDraft } from "../src/application/confirm-recurring-draft";
import { skipRecurringDraft } from "../src/application/skip-recurring-draft";
import { editAndConfirmRecurringDraft } from "../src/application/edit-and-confirm-recurring-draft";
import { DrizzleRecurringDraftRepo } from "../src/adapters/persistence/recurring-draft-repo";
import { DrizzleTransactionRepo } from "../src/adapters/persistence/transaction-repo";
import { DrizzleAccountRepo } from "../src/adapters/persistence/account-repo";
import { DrizzleSpendingProjectionRepo } from "../src/adapters/persistence/spending-projection-repo";

const SYSTEM_USER = "00000000-0000-0000-0000-000000000001";
const DB_URL = (process.env.DATABASE_URL_APP ?? "").replace("@db:", "@localhost:");
// Rewrite Docker hostname → localhost for both connection pool roles
process.env.DATABASE_URL_APP = DB_URL;
if (process.env.DATABASE_URL_WORKER) {
  process.env.DATABASE_URL_WORKER = process.env.DATABASE_URL_WORKER.replace("@db:", "@localhost:");
}
const { resetPools } = await import("@budget/platform");
resetPools();

async function seedTenant(label: string): Promise<{ tenantId: string; userId: string; accountId: string }> {
  const pool = new Pool({ connectionString: DB_URL });
  const client = await pool.connect();
  const userId = crypto.randomUUID();
  const tenantId = crypto.randomUUID();
  const accountId = crypto.randomUUID();

  try {
    await client.query("BEGIN");
    await client.query(`SELECT set_config('app.current_user_id', '${userId}', true)`);
    await client.query(
      `INSERT INTO identity.users (id, email, name, email_verified, created_at, updated_at)
       VALUES ($1, $2, $3, true, now(), now())`,
      [userId, `${label.toLowerCase()}-${userId.slice(0, 8)}@test.local`, label],
    );
    await client.query(
      `INSERT INTO tenancy.workspaces (id, slug, name, kind, default_currency, owner_user_id, member_count, created_at)
       VALUES ($1, $2, $3, 'PRIVATE', 'USD', $4, 1, now())`,
      [tenantId, `ws-${tenantId.slice(0, 8)}`, label, userId],
    );
    await client.query(`SELECT set_config('app.tenant_ids', '{"${tenantId}"}', true)`);
    await client.query(
      `INSERT INTO budgeting.accounts (id, tenant_id, name, kind, scope, currency, current_balance, created_at, actor_user_id)
       VALUES ($1, $2, 'Checking', 'CHECKING', 'PERSONAL', 'USD', 10000.0000, now(), $3)`,
      [accountId, tenantId, userId],
    );
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
    await pool.end();
  }
  return { tenantId, userId, accountId };
}

async function seedRule(tenantId: string, accountId: string, actorUserId: string): Promise<string> {
  const pool = new Pool({ connectionString: DB_URL });
  const client = await pool.connect();
  const ruleId = crypto.randomUUID();
  try {
    await client.query("BEGIN");
    await client.query(`SELECT set_config('app.tenant_ids', '{"${tenantId}"}', true)`);
    await client.query(`SELECT set_config('app.current_user_id', '${actorUserId}', true)`);
    await client.query(
      `INSERT INTO budgeting.recurring_rules
         (id, tenant_id, account_id, amount, currency, kind, cadence, cadence_anchor, active, next_due_date, actor_user_id)
       VALUES ($1, $2, $3, '100', 'USD', 'EXPENSE', 'MONTHLY', 15, true, CURRENT_DATE, $4)`,
      [ruleId, tenantId, accountId, actorUserId],
    );
    await client.query("COMMIT");
  } finally {
    client.release();
    await pool.end();
  }
  return ruleId;
}

async function seedDraft(
  tenantId: string,
  ruleId: string,
  accountId: string,
  dueDateOffset: number = 0,
  amount: string = "100",
): Promise<string> {
  const pool = new Pool({ connectionString: DB_URL });
  const client = await pool.connect();
  const draftId = crypto.randomUUID();
  try {
    await client.query("BEGIN");
    await client.query(`SELECT set_config('app.tenant_ids', '{"${tenantId}"}', true)`);
    await client.query(`SELECT set_config('app.current_user_id', '${SYSTEM_USER}', true)`);
    await client.query(
      `INSERT INTO budgeting.recurring_drafts
         (id, tenant_id, rule_id, due_date, amount, currency, account_id, kind, status, actor_user_id)
       VALUES ($1, $2, $3, (CURRENT_DATE + INTERVAL '${dueDateOffset} days')::date, $4, 'USD', $5, 'EXPENSE', 'PENDING', $6)`,
      [draftId, tenantId, ruleId, amount, accountId, SYSTEM_USER],
    );
    await client.query("COMMIT");
  } finally {
    client.release();
    await pool.end();
  }
  return draftId;
}

describe("recurring draft confirm/skip/edit-confirm integration", () => {
  let draftRepo: DrizzleRecurringDraftRepo;
  let transactionRepo: DrizzleTransactionRepo;
  let tenantA: string;
  let userA: string;
  let accountA: string;

  beforeAll(async () => {
    const seedA = await seedTenant("TenantA-recurring");
    tenantA = seedA.tenantId;
    userA = seedA.userId;
    accountA = seedA.accountId;

    draftRepo = new DrizzleRecurringDraftRepo();
    const accountRepo = new DrizzleAccountRepo();
    const projectionRepo = new DrizzleSpendingProjectionRepo();
    transactionRepo = new DrizzleTransactionRepo(accountRepo, projectionRepo);
  });

  test("confirm: creates ledger row + marks draft CONFIRMED", async () => {
    const ruleId = await seedRule(tenantA, accountA, userA);
    const draftId = await seedDraft(tenantA, ruleId, accountA, 0);

    const confirm = confirmRecurringDraft({ draftRepo, transactionRepo });
    const r = await confirm({ tenantId: tenantA, draftId, actorUserId: userA });

    if (r.isErr()) {
      console.error("confirm error:", r.error.message, r.error.stack);
    }
    expect(r.isOk()).toBe(true);
    const ledgerId = r.isOk() ? r.value.ledgerId : "";

    // Check ledger row exists
    const check = await withTenantTx(TenantId(tenantA), UserId(userA), async (tx) => {
      const drizzleTx = tx as { execute: (q: unknown) => Promise<{ rows: Record<string, unknown>[] }> };
      return drizzleTx.execute(sql`SELECT * FROM budgeting.expense_ledger WHERE id = ${ledgerId}::uuid`);
    });
    expect(check.isOk() && check.value.rows.length).toBe(1);

    // Check draft status
    const draft = await draftRepo.findById(tenantA, draftId);
    expect(draft?.status).toBe("CONFIRMED");

    // Outbox has recurring.confirmed
    const outboxCheck = await withInfraTx(async (tx) => {
      const drizzleTx = tx as { execute: (q: unknown) => Promise<{ rows: Record<string, unknown>[] }> };
      return drizzleTx.execute(sql`
        SELECT * FROM shared_kernel.outbox WHERE event_type = 'budgeting.recurring.confirmed' AND aggregate_id = ${draftId}
      `);
    });
    expect(outboxCheck.isOk()).toBe(true);
    if (outboxCheck.isOk()) expect(outboxCheck.value.rows.length).toBeGreaterThan(0);
  });

  test("skip: marks draft SKIPPED, no ledger row written", async () => {
    const ruleId = await seedRule(tenantA, accountA, userA);
    const draftId = await seedDraft(tenantA, ruleId, accountA, 7);

    const skip = skipRecurringDraft({ draftRepo });
    const skipResult = await skip({ tenantId: tenantA, draftId, actorUserId: userA });

    if (skipResult.isErr()) console.error("skip error:", skipResult.error.message);
    expect(skipResult.isOk()).toBe(true);

    const draft = await draftRepo.findById(tenantA, draftId);
    expect(draft?.status).toBe("SKIPPED");

    // Outbox has recurring.skipped
    const outboxCheck = await withInfraTx(async (tx) => {
      const drizzleTx = tx as { execute: (q: unknown) => Promise<{ rows: Record<string, unknown>[] }> };
      return drizzleTx.execute(sql`
        SELECT * FROM shared_kernel.outbox WHERE event_type = 'budgeting.recurring.skipped' AND aggregate_id = ${draftId}
      `);
    });
    expect(outboxCheck.isOk()).toBe(true);
    if (outboxCheck.isOk()) expect(outboxCheck.value.rows.length).toBeGreaterThan(0);
  });

  test("edit-and-confirm: new amount in ledger row", async () => {
    const ruleId = await seedRule(tenantA, accountA, userA);
    const draftId = await seedDraft(tenantA, ruleId, accountA, 14, "100");

    const editConfirm = editAndConfirmRecurringDraft({ draftRepo, transactionRepo });
    const r = await editConfirm({
      tenantId: tenantA,
      draftId,
      edits: { amount: "250" },
      actorUserId: userA,
    });

    if (r.isErr()) console.error("edit-confirm error:", r.error.message);
    expect(r.isOk()).toBe(true);
    const ledgerId = r.isOk() ? r.value.ledgerId : "";

    const ledgerCheck = await withTenantTx(TenantId(tenantA), UserId(userA), async (tx) => {
      const drizzleTx = tx as { execute: (q: unknown) => Promise<{ rows: Record<string, unknown>[] }> };
      return drizzleTx.execute(sql`SELECT amount_orig FROM budgeting.expense_ledger WHERE id = ${ledgerId}::uuid`);
    });
    expect(ledgerCheck.isOk() && parseFloat(String((ledgerCheck.value.rows[0] as Record<string, unknown>).amount_orig))).toBeCloseTo(250, 1);
  });

  test("confirm twice: second call returns AlreadyConfirmed error", async () => {
    const ruleId = await seedRule(tenantA, accountA, userA);
    const draftId = await seedDraft(tenantA, ruleId, accountA, 21);

    const confirm = confirmRecurringDraft({ draftRepo, transactionRepo });
    await confirm({ tenantId: tenantA, draftId, actorUserId: userA });
    const r2nd = await confirm({ tenantId: tenantA, draftId, actorUserId: userA });

    expect(r2nd.isErr()).toBe(true);
    expect((r2nd.isErr() ? r2nd.error : null)?.constructor.name).toBe("AlreadyConfirmedError");
  });

  test("cross-tenant: tenant B cannot confirm tenant A draft", async () => {
    const ruleId = await seedRule(tenantA, accountA, userA);
    const draftId = await seedDraft(tenantA, ruleId, accountA, 28);

    // Confirm as a different tenant (RLS should block)
    const seedB = await seedTenant("TenantB-xcheck");
    const confirm = confirmRecurringDraft({ draftRepo, transactionRepo });
    const r = await confirm({ tenantId: seedB.tenantId, draftId, actorUserId: seedB.userId });
    // Draft is in tenantA, so RLS returns empty → DraftNotFoundError
    expect(r.isErr()).toBe(true);
    expect((r.isErr() ? r.error : null)?.constructor.name).toBe("DraftNotFoundError");
  });
});
