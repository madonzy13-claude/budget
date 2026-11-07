/**
 * foreign-category.test.ts — a write into budget A naming budget B's category
 * is refused (found by the 15-17 MCP tenant-leak gate). RLS hid B's category
 * from A's reads, but the ledger row was stored pointing at it. Same for a
 * permanently deleted category.
 */
import { describe, it, expect, beforeAll } from "bun:test";
import { setupMcpTestEnv, testApp, baseUrl, signUpTestUser, seedBudget, type TestUser } from "../mcp/helpers";

await setupMcpTestEnv();

let app: Awaited<ReturnType<typeof testApp>>;
let a: TestUser;
let budgetA: string;
let catA: string;
let txnA: string;
let foreign: string;

async function call(method: string, path: string, body?: unknown) {
  const res = await app.fetch(
    new Request(`${baseUrl()}${path}`, {
      method,
      headers: { cookie: a.cookie, "x-budget-id": budgetA, "content-type": "application/json" },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    }),
  );
  return { status: res.status, body: res.status === 204 ? null : ((await res.json()) as any) };
}

beforeAll(async () => {
  app = await testApp();
  a = await signUpTestUser(app);
  budgetA = await seedBudget(a.userId, { currency: "PLN" });
  const b = await signUpTestUser(app);
  const budgetB = await seedBudget(b.userId, { currency: "PLN" });
  const res = await app.fetch(
    new Request(`${baseUrl()}/budgets/${budgetB}/categories`, {
      method: "POST",
      headers: { cookie: b.cookie, "x-budget-id": budgetB, "content-type": "application/json" },
      body: JSON.stringify({ name: "Theirs" }),
    }),
  );
  foreign = ((await res.json()) as any).category.id;
  catA = (await call("POST", `/budgets/${budgetA}/categories`, { name: "Mine" })).body.category.id;
  txnA = (
    await call("POST", `/budgets/${budgetA}/transactions`, { date: "2026-10-01", category_id: catA, amount_original_cents: 100 })
  ).body.transaction.id;
}, 30_000);

describe("a category from another budget", () => {
  it("is refused when creating a transaction", async () => {
    const r = await call("POST", `/budgets/${budgetA}/transactions`, {
      date: "2026-10-02",
      category_id: foreign,
      amount_original_cents: 999,
    });
    expect(r).toMatchObject({ status: 422, body: { error: "category_not_found" } });
  });

  it("is refused when editing or bulk-moving a transaction", async () => {
    expect(await call("PATCH", `/budgets/${budgetA}/transactions/${txnA}`, { category_id: foreign })).toMatchObject({
      status: 422,
      body: { error: "category_not_found" },
    });
    expect(
      await call("POST", `/budgets/${budgetA}/transactions/bulk-recategorize`, {
        transactionIds: [txnA],
        newCategoryId: foreign,
      }),
    ).toMatchObject({ status: 422, body: { error: "category_not_found" } });
    const t = await call("GET", `/budgets/${budgetA}/transactions/${txnA}`);
    expect(t.body.transaction.category_id).toBe(catA);
  });

  it("is refused when creating or editing a scheduled payment", async () => {
    const sp = {
      category_id: foreign,
      amount: "10",
      currency: "PLN",
      first_due_date: "2026-12-05",
      cadence: "MONTHLY",
      cadence_anchor: 5,
    };
    expect(await call("POST", `/budgets/${budgetA}/scheduled-payments`, sp)).toMatchObject({
      status: 422,
      body: { error: "category_not_found" },
    });
    const id = (await call("POST", `/budgets/${budgetA}/scheduled-payments`, { ...sp, category_id: catA })).body.ruleId;
    expect(
      await call("PATCH", `/budgets/${budgetA}/scheduled-payments/${id}`, {
        edits: { categoryId: foreign },
        applyToFuture: true,
      }),
    ).toMatchObject({ status: 422, body: { error: "category_not_found" } });
  });
});
