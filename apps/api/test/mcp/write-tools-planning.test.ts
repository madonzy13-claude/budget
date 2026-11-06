/**
 * write-tools-planning.test.ts — 15-14: scheduled payments and tasks through
 * the app's own routes. Real app, real tokens, real Postgres.
 */
import { describe, it, expect, beforeAll } from "bun:test";
import { Pool } from "pg";
import {
  setupMcpTestEnv,
  testApp,
  baseUrl,
  signUpTestUser,
  seedBudget,
  mintMcpToken,
  createSdkClient,
  type TestUser,
} from "./helpers";

await setupMcpTestEnv();
const { clearRateLimits } = await import("../../src/middleware/rate-limit");
const { withUserContext, insertWriteLog } = await import("@budget/platform");
const { UserId } = await import("@budget/shared-kernel");

type App = Awaited<ReturnType<typeof testApp>>;
type Client = Awaited<ReturnType<typeof createSdkClient>>;
type Result = {
  isError?: boolean;
  structuredContent?: Record<string, any>;
  content: Array<{ text: string }>;
};

let app: App;
let a: TestUser;
let budgetId: string;
let foodId: string;
let client: Client;
const today = () => new Date().toISOString().slice(0, 10);

async function q<T = any>(text: string, params: unknown[], user = true): Promise<T[]> {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL_APP });
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    await c.query(`SELECT set_config('app.tenant_ids', $1, true)`, [`{${budgetId}}`]);
    if (user) await c.query(`SELECT set_config('app.current_user_id', $1, true)`, [a.userId]);
    const r = await c.query(text, params);
    await c.query("COMMIT");
    return r.rows as T[];
  } finally {
    c.release();
    await pool.end();
  }
}

async function tool(name: string, args: Record<string, unknown>, c = client): Promise<Result> {
  clearRateLimits();
  return (await c.callTool({ name, arguments: args })) as Result;
}
const errorOf = (r: Result) => JSON.parse(r.content[0]!.text).error as string;
const logOf = (callId: string) =>
  q(`SELECT * FROM shared_kernel.mcp_write_log WHERE call_id = $1`, [callId]);

async function rules() {
  const res = await app.fetch(
    new Request(`${baseUrl()}/budgets/${budgetId}/scheduled-payments`, {
      headers: { cookie: a.cookie, "x-budget-id": budgetId },
    }),
  );
  return ((await res.json()) as { rules: Array<{ id: string; amount: string; note: string }> })
    .rules;
}

async function seedOccurrence(ruleId: string, daysAhead: number): Promise<string> {
  const id = crypto.randomUUID();
  await q(
    `INSERT INTO budgeting.expense_ledger
       (id, tenant_id, budget_id, category_id, transaction_date, amount_original_cents,
        currency_original, amount_converted_cents, fx_rate, fx_as_of, kind,
        scheduled_payment_id, confirmed_at, created_at, updated_at)
     VALUES ($1, $2, $2, $3, current_date + $5::int, 2999, 'EUR', 2999, 1, current_date,
             'SPENDING', $4, NULL, now(), now())`,
    [id, budgetId, foodId, ruleId, daysAhead],
  );
  return id;
}

async function seedTask(): Promise<string> {
  const id = crypto.randomUUID();
  await q(
    `INSERT INTO budgeting.tasks (id, tenant_id, budget_id, kind, payload_json, status)
     VALUES ($1, $2, $2, 'CUSHION_BELOW_TARGET', '{}'::jsonb, 'PENDING')`,
    [id, budgetId],
  );
  return id;
}

let ruleId: string;

beforeAll(async () => {
  app = await testApp();
  a = await signUpTestUser(app);
  budgetId = await seedBudget(a.userId, { currency: "EUR" });
  foodId = crypto.randomUUID();
  await q(
    `INSERT INTO budgeting.categories (id, tenant_id, name, created_at, actor_user_id)
     VALUES ($1, $2, 'Bills', now(), $3)`,
    [foodId, budgetId, a.userId],
  );
  const t = await mintMcpToken(app, a, ["read", "write"]);
  client = await createSdkClient(app, t.accessToken);
});

describe("scheduled payments", () => {
  it("create_scheduled_payment adds one like the app", async () => {
    const r = await tool("create_scheduled_payment", {
      budget_id: budgetId,
      category_id: foodId,
      amount: "29.99",
      currency: "EUR",
      note: "Internet",
      first_due_date: today(),
      cadence: "MONTHLY",
      cadence_anchor: 1,
    });
    expect(r.isError).toBeFalsy();
    ruleId = r.structuredContent!.scheduled_payment.id;
    expect((await rules()).map((x) => x.id)).toContain(ruleId);
    const [log] = await logOf(r.structuredContent!.call_id);
    expect(log).toMatchObject({ op: "create", entity_type: "scheduled_payment", entity_id: ruleId });
  });

  it("edit_scheduled_payment changes it and logs before and after", async () => {
    const r = await tool("edit_scheduled_payment", {
      budget_id: budgetId,
      scheduled_payment_id: ruleId,
      changes: { amount: "34.99" },
    });
    expect(r.isError).toBeFalsy();
    expect((await rules()).find((x) => x.id === ruleId)!.amount).toMatch(/^34\.99/);
    const [log] = await logOf(r.structuredContent!.call_id);
    expect(log).toMatchObject({ op: "update", entity_id: ruleId });
    expect(log.before_jsonb.amount).toMatch(/^29\.99/);
  });

  it("confirm_scheduled_payment confirms an occurrence, never saying draft", async () => {
    const occ = await seedOccurrence(ruleId, 3);
    const r = await tool("confirm_scheduled_payment", {
      budget_id: budgetId,
      occurrence_id: occ,
    });
    expect(r.isError).toBeFalsy();
    expect(r.content[0]!.text.toLowerCase()).not.toContain("draft");
    const [row] = await q(`SELECT confirmed_at FROM budgeting.expense_ledger WHERE id = $1`, [occ]);
    expect(row.confirmed_at).not.toBeNull();
    const [log] = await logOf(r.structuredContent!.call_id);
    expect(log).toMatchObject({ op: "update", entity_type: "transaction", entity_id: occ });
  });

  it("delete_scheduled_payment removes it like the app", async () => {
    const r = await tool("delete_scheduled_payment", {
      budget_id: budgetId,
      scheduled_payment_id: ruleId,
    });
    expect(r.isError).toBeFalsy();
    expect((await rules()).map((x) => x.id)).not.toContain(ruleId);
    const [log] = await logOf(r.structuredContent!.call_id);
    expect(log).toMatchObject({ op: "delete", entity_id: ruleId });
  });

  it("no tool description mentions drafts", async () => {
    const { tools } = await client.listTools();
    const text = JSON.stringify(tools.filter((t) => /scheduled|task/.test(t.name)));
    expect(text.toLowerCase()).not.toContain("draft");
  });
});

describe("complete_task", () => {
  it("resolves a task like the app's banner action", async () => {
    const id = await seedTask();
    const r = await tool("complete_task", { budget_id: budgetId, task_id: id });
    expect(r.isError).toBeFalsy();
    const [row] = await q(`SELECT status FROM budgeting.tasks WHERE id = $1`, [id]);
    expect(row.status).toBe("RESOLVED");
    const [log] = await logOf(r.structuredContent!.call_id);
    expect(log).toMatchObject({ op: "update", entity_type: "task", entity_id: id });
  });
});

describe("daily cap on the planning tools", () => {
  it("refuses each one before it changes anything", async () => {
    const t = await mintMcpToken(app, a, ["read", "write"]);
    const capped = await createSdkClient(app, t.accessToken);
    const made = await tool("create_scheduled_payment", {
      budget_id: budgetId,
      amount: "5.00",
      currency: "EUR",
      first_due_date: today(),
      cadence: "MONTHLY",
      cadence_anchor: 2,
    });
    const rule = made.structuredContent!.scheduled_payment.id;
    const occ = await seedOccurrence(rule, 5);
    const task = await seedTask();
    await withUserContext(UserId(a.userId), (tx) =>
      insertWriteLog(tx, [
        {
          tenantId: budgetId,
          userId: a.userId,
          clientId: t.clientId,
          callId: crypto.randomUUID(),
          batchId: null,
          tool: "add_transactions",
          entityType: "transaction",
          entityId: "seed",
          op: "create",
          before: null,
          after: null,
          entryCount: 5000,
        },
      ]),
    );
    const before = (await rules()).length;
    const calls: Array<[string, Record<string, unknown>]> = [
      ["create_scheduled_payment", { budget_id: budgetId, amount: "1.00", currency: "EUR", first_due_date: today(), cadence: "MONTHLY", cadence_anchor: 3 }],
      ["edit_scheduled_payment", { budget_id: budgetId, scheduled_payment_id: rule, changes: { amount: "9.00" } }],
      ["delete_scheduled_payment", { budget_id: budgetId, scheduled_payment_id: rule }],
      ["confirm_scheduled_payment", { budget_id: budgetId, occurrence_id: occ }],
      ["complete_task", { budget_id: budgetId, task_id: task }],
    ];
    for (const [name, args] of calls) {
      const r = await tool(name, args, capped);
      expect(`${name}:${r.isError ? errorOf(r) : "ok"}`).toBe(`${name}:daily_entry_limit`);
    }
    expect((await rules()).length).toBe(before);
    expect((await rules()).find((x) => x.id === rule)!.amount).toMatch(/^5\.00/);
    const [o] = await q(`SELECT confirmed_at FROM budgeting.expense_ledger WHERE id = $1`, [occ]);
    expect(o.confirmed_at).toBeNull();
    const [tk] = await q(`SELECT status FROM budgeting.tasks WHERE id = $1`, [task]);
    expect(tk.status).toBe("PENDING");
  });
});
