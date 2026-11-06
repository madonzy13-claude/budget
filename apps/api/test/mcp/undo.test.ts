/**
 * undo.test.ts — 15-15: the agent undoes its own logged writes (D-11) through
 * the app's routes, never clobbering a change made since; rollback mode (for
 * import, D-15) reverts a whole batch. Real app, tokens, Postgres.
 */
import { describe, it, expect, beforeAll } from "bun:test";
import { Pool } from "pg";
import {
  setupMcpTestEnv,
  testApp,
  testDeps,
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
const { undoCallOrBatch } = await import("../../src/mcp/tools/undo");

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
let clientId: string;
const today = () => new Date().toISOString().slice(0, 10);
const thisMonth = () => today().slice(0, 7);

async function q<T = any>(text: string, params: unknown[]): Promise<T[]> {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL_APP });
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    await c.query(`SELECT set_config('app.tenant_ids', $1, true)`, [`{${budgetId}}`]);
    await c.query(`SELECT set_config('app.current_user_id', $1, true)`, [a.userId]);
    const r = await c.query(text, params);
    await c.query("COMMIT");
    return r.rows as T[];
  } finally {
    c.release();
    await pool.end();
  }
}

async function cookie(method: string, path: string, body?: unknown) {
  return app.fetch(
    new Request(`${baseUrl()}${path}`, {
      method,
      headers: { cookie: a.cookie, "x-budget-id": budgetId, "content-type": "application/json" },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    }),
  );
}
const getJson = async (path: string) => {
  const r = await cookie("GET", path);
  return { status: r.status, body: r.status === 200 ? ((await r.json()) as any) : null };
};

async function tool(name: string, args: Record<string, unknown>, c = client): Promise<Result> {
  clearRateLimits();
  const r = (await c.callTool({ name, arguments: args })) as Result;
  if (r.isError && !name.startsWith("undo")) throw new Error(`${name}: ${r.content[0]!.text}`);
  return r;
}
const callId = (r: Result) => r.structuredContent!.call_id as string;
const errorOf = (r: Result) => JSON.parse(r.content[0]!.text).error as string;
const undo = (id: string, c = client) => tool("undo", { id }, c);

async function addTxns(n: number, cat = foodId): Promise<Result> {
  return tool("add_transactions", {
    budget_id: budgetId,
    idempotency_key: `k-${crypto.randomUUID()}`,
    rows: Array.from({ length: n }, (_, i) => ({
      date: today(),
      category_id: cat,
      amount: `${i + 1}.00`,
    })),
  });
}
const txn = (id: string) => getJson(`/budgets/${budgetId}/transactions/${id}`);
const category = (id: string) => getJson(`/budgets/${budgetId}/categories/${id}`);
const effective = (cat: string) =>
  getJson(`/budgets/${budgetId}/categories/${cat}/limits/effective?date=${thisMonth()}-01`);

beforeAll(async () => {
  app = await testApp();
  a = await signUpTestUser(app);
  budgetId = await seedBudget(a.userId, { currency: "EUR" });
  foodId = crypto.randomUUID();
  await q(
    `INSERT INTO budgeting.categories (id, tenant_id, name, created_at, actor_user_id)
     VALUES ($1, $2, 'Food', now(), $3)`,
    [foodId, budgetId, a.userId],
  );
  const t = await mintMcpToken(app, a, ["read", "write"]);
  clientId = t.clientId;
  client = await createSdkClient(app, t.accessToken);
});

describe("undo — transactions", () => {
  it("undoes an add_transactions call", async () => {
    const r = await addTxns(3);
    const ids = r.structuredContent!.created.map((t: { id: string }) => t.id);
    const u = await undo(callId(r));
    expect(u.isError).toBeFalsy();
    expect(u.structuredContent).toMatchObject({
      reverted: 3,
      skipped_changed_since: [],
      not_undoable: [],
    });
    for (const id of ids) expect((await txn(id)).status).toBe(404);
  });

  it("never clobbers a change the user made since", async () => {
    const id = (await addTxns(1)).structuredContent!.created[0].id;
    const e = await tool("edit_transaction", {
      budget_id: budgetId,
      transaction_id: id,
      changes: { amount: "20.00" },
    });
    const mine = await cookie("PATCH", `/budgets/${budgetId}/transactions/${id}`, {
      amount_original_cents: 3300,
    });
    expect(mine.status).toBe(200);
    const u = await undo(callId(e));
    expect(u.structuredContent!.skipped_changed_since).toEqual([id]);
    expect((await txn(id)).body.transaction.amount_original_cents).toBe("3300");
  });

  it("undoes an edit back to the row before", async () => {
    const id = (await addTxns(1)).structuredContent!.created[0].id;
    const e = await tool("edit_transaction", {
      budget_id: budgetId,
      transaction_id: id,
      changes: { amount: "20.00", note: "agent" },
    });
    await undo(callId(e));
    const t = (await txn(id)).body.transaction;
    expect(t.amount_original_cents).toBe("100");
    expect(t.note).toBeNull();
  });

  it("restores a deleted transaction", async () => {
    const id = (await addTxns(1)).structuredContent!.created[0].id;
    const d = await tool("delete_transaction", { budget_id: budgetId, transaction_id: id });
    expect((await txn(id)).status).toBe(404);
    expect((await undo(callId(d))).structuredContent!.reverted).toBe(1);
    expect((await txn(id)).status).toBe(200);
  });
});

describe("undo — wallets, limits, categories", () => {
  it("puts a wallet balance back", async () => {
    const w = (await (
      await cookie("POST", "/wallets", { name: "Cash", walletType: "SPENDINGS", currency: "EUR" })
    ).json()) as { id: string };
    await cookie("PUT", `/wallets/${w.id}/balance`, { amount: "100.00", currency: "EUR" });
    const s = await tool("sync_wallet_balance", {
      budget_id: budgetId,
      wallet_id: w.id,
      balance: "250.00",
      currency: "EUR",
    });
    await undo(callId(s));
    expect((await getJson(`/wallets/${w.id}`)).body.currentBalanceCents).toBe("10000");
  });

  it("puts the previous limit back, or no limit when there was none", async () => {
    const cat = (await tool("create_category", { budget_id: budgetId, name: "Fun" }))
      .structuredContent!.category.id;
    expect((await effective(cat)).status).toBe(404);
    const first = await tool("set_category_limit", {
      budget_id: budgetId,
      category_id: cat,
      month: thisMonth(),
      amount: "500.00",
    });
    const second = await tool("set_category_limit", {
      budget_id: budgetId,
      category_id: cat,
      month: thisMonth(),
      amount: "700.00",
    });
    await undo(callId(second));
    expect((await effective(cat)).body.normalAmount).toBe("50000");
    await undo(callId(first));
    const none = await effective(cat);
    // The app's own "No limit" segment: unbounded, exactly as before the write.
    expect(none.status === 404 || none.body.noLimit === true).toBe(true);
  });

  it("archives a created category, renames back, unarchives", async () => {
    const made = await tool("create_category", { budget_id: budgetId, name: "Temp" });
    const id = made.structuredContent!.category.id;
    const renamed = await tool("rename_category", { budget_id: budgetId, category_id: id, name: "Temp 2" });
    await undo(callId(renamed));
    expect((await category(id)).body.name).toBe("Temp");

    const archived = await tool("archive_category", { budget_id: budgetId, category_id: id });
    await undo(callId(archived));
    expect((await category(id)).body.archivedAt).toBeNull();

    await undo(callId(made));
    const after = await category(id);
    expect(after.status).toBe(200); // agent mode never hard-deletes
    expect(after.body.archivedAt).not.toBeNull();
  });
});

describe("undo — scheduled payments, investments, not undoable", () => {
  it("removes a created scheduled payment and reverts an edit", async () => {
    const made = await tool("create_scheduled_payment", {
      budget_id: budgetId,
      amount: "10.00",
      currency: "EUR",
      first_due_date: today(),
      cadence: "MONTHLY",
      cadence_anchor: 5,
    });
    const id = made.structuredContent!.scheduled_payment.id;
    const edit = await tool("edit_scheduled_payment", {
      budget_id: budgetId,
      scheduled_payment_id: id,
      changes: { amount: "12.00" },
    });
    const rules = async () =>
      (await getJson(`/budgets/${budgetId}/scheduled-payments`)).body.rules as Array<{
        id: string;
        amount: string;
      }>;
    await undo(callId(edit));
    expect((await rules()).find((r) => r.id === id)!.amount).toMatch(/^10\.00/);
    await undo(callId(made));
    expect((await rules()).map((r) => r.id)).not.toContain(id);
  });

  it("undoes an agent-recorded investment entry while it is newest (a1)", async () => {
    const buy = await tool("record_investment_transaction", {
      budget_id: budgetId,
      side: "buy",
      new_asset: { name: "Pot", type: "savings" },
      date: today(),
      amount: "1000.00",
      currency: "EUR",
    });
    const asset = buy.structuredContent!.asset_id;
    const value = await tool("update_holding_value", {
      budget_id: budgetId,
      asset_id: asset,
      value: "1200.00",
    });
    await undo(callId(value));
    const holdings = (await getJson(`/budgets/${budgetId}/investments`)).body.holdings as Array<{
      id: string;
      currentPriceCents: string;
    }>;
    expect(holdings.find((h) => h.id === asset)!.currentPriceCents).toBe("100000");
  });

  it("reports what it cannot undo", async () => {
    const b = await tool("budget_create", { name: "Kept", currency: "EUR" });
    const u = await undo(callId(b));
    expect(u.structuredContent!.not_undoable).toEqual([b.structuredContent!.id]);
    expect(u.structuredContent!.reverted).toBe(0);
  });
});

describe("undo — guards and listing", () => {
  it("refuses an already-reverted call, another connection's call and an old one", async () => {
    const r = await addTxns(1);
    await undo(callId(r));
    expect(errorOf(await undo(callId(r)))).toBe("already_reverted");

    const other = await mintMcpToken(app, a, ["read", "write"]);
    const otherClient = await createSdkClient(app, other.accessToken);
    const r2 = await addTxns(1);
    expect(errorOf(await undo(callId(r2), otherClient))).toBe("not_found");

    const old = crypto.randomUUID();
    await withUserContext(UserId(a.userId), (tx) =>
      insertWriteLog(tx, [
        {
          tenantId: budgetId,
          userId: a.userId,
          clientId,
          callId: old,
          batchId: null,
          tool: "add_transactions",
          entityType: "transaction",
          entityId: crypto.randomUUID(),
          op: "create",
          before: null,
          after: null,
          entryCount: 1,
          createdAt: new Date(Date.now() - 8 * 86_400_000),
        },
      ]),
    );
    expect(errorOf(await undo(old))).toBe("outside_undo_window");
  });

  it("lists this connection's recent writes, newest first", async () => {
    const r = await addTxns(2);
    const list = await tool("list_recent_writes", { limit: 5 });
    const first = list.structuredContent!.writes[0];
    expect(first).toMatchObject({ call_id: callId(r), tool: "add_transactions", reverted: false, undoable: true });
    expect(first.entities).toHaveLength(2);
  });
});

describe("undoCallOrBatch rollback mode (import, D-15)", () => {
  it("reverts every effect of a batch, hard-deleting a category made in it", async () => {
    const steps: Result[] = [];
    const cat = await tool("create_category", { budget_id: budgetId, name: "Imported" });
    steps.push(cat);
    const catId = cat.structuredContent!.category.id;
    const txns = await addTxns(2, catId);
    steps.push(txns);
    steps.push(
      await tool("set_category_limit", { budget_id: budgetId, category_id: catId, month: thisMonth(), amount: "90.00" }),
    );
    const buy = await tool("record_investment_transaction", {
      budget_id: budgetId,
      side: "buy",
      new_asset: { name: "Imported ETF", type: "etf" },
      date: today(),
      quantity: "2",
      price: "10.00",
      currency: "EUR",
    });
    steps.push(buy);
    const asset = buy.structuredContent!.asset_id;
    steps.push(
      await tool("record_investment_transaction", {
        budget_id: budgetId,
        side: "buy",
        asset_id: asset,
        date: today(),
        quantity: "1",
        price: "11.00",
        currency: "EUR",
      }),
    );
    const w = (await (
      await cookie("POST", "/wallets", { name: "Imp", walletType: "SPENDINGS", currency: "EUR" })
    ).json()) as { id: string };
    steps.push(
      await tool("sync_wallet_balance", { budget_id: budgetId, wallet_id: w.id, balance: "40.00", currency: "EUR" }),
    );
    const sp = await tool("create_scheduled_payment", {
      budget_id: budgetId,
      amount: "3.00",
      currency: "EUR",
      first_due_date: today(),
      cadence: "MONTHLY",
      cadence_anchor: 9,
    });
    steps.push(sp);

    // The same effects, as one import batch.
    const batch = crypto.randomUUID();
    const rows = await q(
      `SELECT * FROM shared_kernel.mcp_write_log WHERE call_id = ANY($1::uuid[])
        ORDER BY created_at, id`,
      [steps.map(callId)],
    );
    const t0 = Date.now();
    await withUserContext(UserId(a.userId), (tx) =>
      insertWriteLog(
        tx,
        rows.map((r, i) => ({
          tenantId: r.tenant_id,
          userId: a.userId,
          clientId,
          callId: crypto.randomUUID(),
          batchId: batch,
          tool: "import_commit",
          entityType: r.entity_type,
          entityId: r.entity_id,
          op: r.op,
          before: r.before_jsonb,
          after: r.after_jsonb,
          entryCount: 1,
          createdAt: new Date(t0 + i),
        })),
      ),
    );

    const out = await undoCallOrBatch(
      {
        who: { userId: a.userId, clientId, email: a.email, locale: "en" },
        scopes: ["read", "write"],
        deps: await testDeps(),
        app,
      },
      batch,
      { mode: "rollback", callId: crypto.randomUUID() },
    );
    expect(out.isOk()).toBe(true);
    expect(out._unsafeUnwrap().failed_inverses).toEqual([]);

    expect((await category(catId)).status).toBe(404);
    for (const t of txns.structuredContent!.created) expect((await txn(t.id)).status).toBe(404);
    const holdings = (await getJson(`/budgets/${budgetId}/investments?hidden=1`)).body.holdings.concat(
      (await getJson(`/budgets/${budgetId}/investments`)).body.holdings,
    ) as Array<{ id: string }>;
    expect(holdings.map((h) => h.id)).not.toContain(asset);
    expect((await getJson(`/wallets/${w.id}`)).body.currentBalanceCents).toBe("0");
    const rules = (await getJson(`/budgets/${budgetId}/scheduled-payments`)).body.rules as Array<{ id: string }>;
    expect(rules.map((r) => r.id)).not.toContain(sp.structuredContent!.scheduled_payment.id);
  });
});
