/**
 * budgets-active-tasks-count-cross-tenant.test.ts — Tenant-leak gate.
 *
 * Verifies that `pendingTasksCount` returned from GET /budgets/active is
 * scoped to the authenticated user. Even if budgetB has N pending tasks,
 * user A (who only owns budgetA) must see budgetA.pendingTasksCount === 0
 * — both because RLS blocks reading budgetB.tasks at all, AND because the
 * SQL aggregate joins on budgeting.tasks where tenant_id is GUC-scoped.
 *
 * Gate accounting (`make ci-gate` → tests/tenant-leak/*.test.ts):
 * Count goes from 8 → 9 with this file.
 */
import { describe, it, expect, beforeAll } from "bun:test";
import { Pool } from "pg";

const DB_URL_RAW = process.env.DATABASE_URL_APP;
if (!DB_URL_RAW)
  throw new Error("DATABASE_URL_APP required for tenant-leak gate tests");
process.env.DATABASE_URL_APP = DB_URL_RAW.replace("@db:", "@localhost:");
const DB_URL = process.env.DATABASE_URL_APP;

const { resetPools } = await import("@budget/platform");
const { createTenancyModule } = await import("@budget/tenancy");

const noopEmailSender = {
  send: async () => {},
} as Parameters<typeof createTenancyModule>[0]["emailSender"];

// Seed data — one row per unique-constraint bucket.
// Dedup constraints:
//   tasks_reserve_topup_dedup_idx        — UNIQUE (budget_id) WHERE kind='RESERVE_TOPUP'
//   tasks_cushion_below_target_pending_uq — UNIQUE (budget_id) WHERE kind='CUSHION_BELOW_TARGET'
//   tasks_confirm_draft_dedup_idx         — UNIQUE (payload_json->>'draft_id') WHERE kind='CONFIRM_DRAFT'
//
// 260612-kxd addendum: pendingTasksCount now counts only ACTIONABLE tasks —
// a CONFIRM_DRAFT counts only while its draft is live in a non-archived
// category, probed via a tenant-joined EXISTS on budgeting.expense_ledger.
// So (a) budgetB's CONFIRM_DRAFT seed must reference a REAL live draft (an
// orphan-shaped seed is correctly excluded), and (b) the gate gains a new
// vector: a budgetB task whose payload points at budgetA's live draft must
// NOT count — the EXISTS must never let one tenant's ledger state activate
// another tenant's task.
const EXPECTED_TASK_COUNT = 3;

let userA: string;
let userB: string;
let budgetA: string;
let budgetB: string;
let mod: ReturnType<typeof createTenancyModule>;

/** Insert a category + live unconfirmed draft inside an RLS-scoped tx. */
async function seedLiveDraft(
  client: import("pg").PoolClient,
  budgetId: string,
  userId: string,
): Promise<string> {
  const categoryId = crypto.randomUUID();
  const draftId = crypto.randomUUID();
  await client.query("BEGIN");
  await client.query(`SELECT set_config('app.tenant_ids', $1, true)`, [
    `{${budgetId}}`,
  ]);
  await client.query(`SELECT set_config('app.current_user_id', $1, true)`, [
    userId,
  ]);
  await client.query(
    `INSERT INTO budgeting.categories
       (id, tenant_id, name, sort_index, reserve_excluded, actor_user_id, created_at)
     VALUES ($1, $2, 'TLeak Cat', 0, false, $3, now())`,
    [categoryId, budgetId, userId],
  );
  await client.query(
    `INSERT INTO budgeting.expense_ledger
       (id, tenant_id, budget_id, category_id, transaction_date,
        amount_original_cents, currency_original,
        amount_converted_cents, fx_rate, fx_as_of,
        note, confirmed_at, kind, created_at, updated_at)
     VALUES ($1, $2, $2, $3, now()::date,
             1000, 'EUR', 1000, '1'::numeric, now()::date,
             NULL, NULL, 'SPENDING', now(), now())`,
    [draftId, budgetId, categoryId],
  );
  await client.query("COMMIT");
  return draftId;
}

beforeAll(async () => {
  await resetPools();
  const pool = new Pool({ connectionString: DB_URL });
  const client = await pool.connect();
  try {
    userA = crypto.randomUUID();
    userB = crypto.randomUUID();
    budgetA = crypto.randomUUID();
    budgetB = crypto.randomUUID();

    await client.query("BEGIN");
    await client.query(
      `INSERT INTO identity.users (id, email, name, email_verified, created_at, updated_at)
       VALUES ($1, $2, 'A', true, now(), now()),
              ($3, $4, 'B', true, now(), now())`,
      [
        userA,
        `a-${userA.slice(0, 8)}@test.example`,
        userB,
        `b-${userB.slice(0, 8)}@test.example`,
      ],
    );
    await client.query(
      `INSERT INTO tenancy.budgets (id, slug, name, kind, default_currency, owner_user_id, member_count, created_at)
       VALUES ($1, $2, 'A', 'PRIVATE', 'EUR', $3, 1, now()),
              ($4, $5, 'B', 'PRIVATE', 'EUR', $6, 1, now())`,
      [
        budgetA,
        `tleak-a-${budgetA.slice(0, 8)}`,
        userA,
        budgetB,
        `tleak-b-${budgetB.slice(0, 8)}`,
        userB,
      ],
    );
    await client.query(
      `INSERT INTO tenancy.budget_members (id, budget_id, user_id, role, created_at)
       VALUES ($1, $2, $3, 'owner', now()),
              ($4, $5, $6, 'owner', now())`,
      [
        crypto.randomUUID(),
        budgetA,
        userA,
        crypto.randomUUID(),
        budgetB,
        userB,
      ],
    );
    await client.query("COMMIT");

    // Drafts: a LIVE one in budgetB (its CONFIRM_DRAFT counts) and a LIVE one
    // in budgetA (referenced cross-tenant from a budgetB task — must NOT count).
    const draftClient = await pool.connect();
    let draftB: string;
    let draftA: string;
    try {
      draftB = await seedLiveDraft(draftClient, budgetB, userB);
      draftA = await seedLiveDraft(draftClient, budgetA, userA);
    } finally {
      draftClient.release();
    }

    // Seed budgetB's tasks as a single atomic INSERT inside one RLS-scoped
    // transaction: 3 actionable + 1 cross-tenant CONFIRM_DRAFT probe.
    const taskSeeds = [
      { kind: "RESERVE_TOPUP", payload: {} },
      { kind: "CUSHION_BELOW_TARGET", payload: {} },
      { kind: "CONFIRM_DRAFT", payload: { draft_id: draftB } },
      // T-kxd-02 vector: payload points at TENANT A's live draft. The
      // actionability EXISTS is tenant-joined, so this must stay excluded.
      { kind: "CONFIRM_DRAFT", payload: { draft_id: draftA } },
    ] as const;
    const taskClient = await pool.connect();
    try {
      const values = taskSeeds
        .map(
          (s) =>
            `('${crypto.randomUUID()}', '${budgetB}', '${budgetB}', '${s.kind}', 'PENDING', '${JSON.stringify(s.payload)}'::jsonb, NOW())`,
        )
        .join(", ");
      await taskClient.query("BEGIN");
      await taskClient.query(`SELECT set_config('app.tenant_ids', $1, true)`, [
        `{${budgetB}}`,
      ]);
      await taskClient.query(
        `SELECT set_config('app.current_user_id', $1, true)`,
        [userB],
      );
      await taskClient.query(
        `INSERT INTO budgeting.tasks
           (id, tenant_id, budget_id, kind, status, payload_json, created_at)
         VALUES ${values}`,
      );
      await taskClient.query("COMMIT");
    } catch (e) {
      await taskClient.query("ROLLBACK");
      throw e;
    } finally {
      taskClient.release();
    }
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    client.release();
    await pool.end();
  }

  mod = createTenancyModule({
    emailSender: noopEmailSender,
    appUrl: "http://localhost:3000",
  });
});

describe("GET /budgets/active — pendingTasksCount tenant isolation", () => {
  it("user A sees pendingTasksCount=0 on budgetA even though budgetB has pending tasks", async () => {
    const budgets = await mod.budgetRepo.listForUser(userA);
    const a = budgets.find((b) => b.id === budgetA);
    expect(a).toBeDefined();
    expect(a!.pendingTasksCount).toBe(0);
    expect(budgets.find((b) => b.id === budgetB)).toBeUndefined();
  });

  it(`user B sees pendingTasksCount=${EXPECTED_TASK_COUNT} on budgetB (cross-tenant draft reference does NOT count)`, async () => {
    // 4 PENDING rows seeded; the CONFIRM_DRAFT pointing at tenant A's draft
    // must be excluded by the tenant-joined actionability EXISTS → 3.
    const budgets = await mod.budgetRepo.listForUser(userB);
    const b = budgets.find((b) => b.id === budgetB);
    expect(b).toBeDefined();
    expect(b!.pendingTasksCount).toBe(EXPECTED_TASK_COUNT);
  });
});
