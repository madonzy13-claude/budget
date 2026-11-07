/**
 * import.test.ts — 15-16: import_preview checks all five kinds without
 * saving anything; import_commit writes transactions all-or-nothing (with
 * categories created from category_map); import_undo reverts a batch.
 * Real app, real tokens, real Postgres; only the FX provider is pinned.
 */
import { describe, it, expect, beforeAll } from "bun:test";
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
const { NoFxRateAvailable } = await import(
  "@budget/budgeting/src/adapters/fx/frankfurter"
);

type App = Awaited<ReturnType<typeof testApp>>;
type Client = Awaited<ReturnType<typeof createSdkClient>>;
type Result = {
  isError?: boolean;
  structuredContent?: Record<string, any>;
  content: Array<{ text: string }>;
};

const GAP_DATE = "2026-01-15";
let app: App;
let a: TestUser;
let budgetId: string;
let client: Client;
let groceries: string;
let fuel: string;

async function cookie(method: string, path: string, body?: unknown) {
  const res = await app.fetch(
    new Request(`${baseUrl()}${path}`, {
      method,
      headers: { cookie: a.cookie, "x-budget-id": budgetId, "content-type": "application/json" },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    }),
  );
  if (!res.ok) throw new Error(`${method} ${path} ${res.status} ${await res.text()}`);
  return res.status === 204 ? null : res.json();
}

async function tool(name: string, args: Record<string, unknown>, c = client): Promise<Result> {
  clearRateLimits();
  return (await c.callTool({ name, arguments: args })) as Result;
}
const errorOf = (r: Result) => JSON.parse(r.content[0]!.text) as Record<string, any>;

/** Every table an import can write to, counted through the app's own routes. */
async function counts() {
  const txns = (await cookie("GET", `/budgets/${budgetId}/transactions/search?limit=200`)) as {
    transactions: unknown[];
  };
  const active = (await cookie("GET", `/budgets/${budgetId}/categories`)) as { categories: unknown[] };
  const all = (await cookie("GET", `/budgets/${budgetId}/categories?includeArchived=true`)) as {
    categories: unknown[];
  };
  const holdings = (await cookie("GET", `/budgets/${budgetId}/investments?hidden=1`)) as {
    holdings: unknown[];
  };
  const visible = (await cookie("GET", `/budgets/${budgetId}/investments`)) as { holdings: unknown[] };
  const rules = (await cookie("GET", `/budgets/${budgetId}/scheduled-payments`)) as { rules: unknown[] };
  return {
    txns: txns.transactions.length,
    categories: active.categories.length,
    allCategories: all.categories.length,
    holdings: holdings.holdings.length + visible.holdings.length,
    rules: rules.rules.length,
  };
}

const txn = (date: string, category: string, amount: string, extra: Record<string, unknown> = {}) => ({
  date,
  category,
  amount,
  ...extra,
});

let walletId: string;
let btc: string;

beforeAll(async () => {
  app = await testApp();
  // ponytail: one pinned rate (4) everywhere, and a gap on GAP_DATE.
  const fx = (await testDeps()).budgeting.fxProvider;
  fx.rateAsOf = async (from, to, at) => {
    if (from === to) return { rate: "1", provider: "test", isStale: false };
    if (at.toISOString().startsWith(GAP_DATE)) throw new NoFxRateAvailable(from, to, GAP_DATE);
    return { rate: "4", provider: "test", isStale: false };
  };
  a = await signUpTestUser(app);
  budgetId = await seedBudget(a.userId, { currency: "PLN" });
  const t = await mintMcpToken(app, a, ["read", "write"]);
  client = await createSdkClient(app, t.accessToken);
  groceries = ((await cookie("POST", `/budgets/${budgetId}/categories`, { name: "Groceries" })) as any).category.id;
  fuel = ((await cookie("POST", `/budgets/${budgetId}/categories`, { name: "Fuel" })) as any).category.id;
  for (const amount of [1250, 4000])
    await cookie("POST", `/budgets/${budgetId}/transactions`, {
      date: "2026-02-03",
      category_id: groceries,
      amount_original_cents: amount,
    });
  walletId = ((await cookie("POST", "/wallets", { name: "Bank", walletType: "SPENDINGS", currency: "PLN" })) as any).id;
  const h = (await cookie("POST", `/budgets/${budgetId}/investments`, {
    name: "BTC",
    holdingType: "crypto",
    uiType: "crypto",
    quantity: "1",
    buyPriceCents: 100000,
    buyCurrency: "PLN",
    currentPriceCents: 100000,
    currentPriceCurrency: "PLN",
    openedOn: "2026-03-01",
  })) as any;
  btc = h.id;
}, 30_000);

describe("import_preview", () => {
  it("10 clean rows (by name or id) → clean, and nothing is written", async () => {
    const before = await counts();
    const rows = Array.from({ length: 10 }, (_, i) =>
      txn(`2026-02-${String(10 + i).padStart(2, "0")}`, i % 2 ? "groceries" : fuel, `${i + 1}.50`),
    );
    const r = await tool("import_preview", { budget_id: budgetId, kind: "transactions", rows });
    expect(r.isError).toBeFalsy();
    expect(r.structuredContent).toMatchObject({ clean: true, counts: { rows: 10 } });
    expect(r.structuredContent!.preview_id).toBeString();
    expect(await counts()).toEqual(before);
  });

  it("reports ALL problems at once, with row indexes", async () => {
    const rows = [
      txn("2026-02-03", "Groceries", "12.50"), // 0 dupe of existing
      txn("2026-02-03", groceries, "40.00"), // 1 dupe of existing
      txn("2026-02-20", "Fuel", "99.00"), // 2
      txn("2026-02-20", "Fuel", "99.00"), // 3 in-batch dupe of 2
      txn("2026-02-21", "Groceriez", "5.00"), // 4 unknown
      txn("2026-02-21", "Pets", "6.00"), // 5 unknown
      txn(GAP_DATE, "Fuel", "10.00", { currency: "USD" }), // 6 FX gap
      txn("2026-02-22", "Fuel", "1,5"), // 7 invalid
    ];
    const r = await tool("import_preview", { budget_id: budgetId, kind: "transactions", rows });
    expect(r.isError).toBeFalsy();
    const s = r.structuredContent!;
    expect(s.clean).toBe(false);
    expect(s.issues.duplicates.map((d: any) => d.index).sort()).toEqual([0, 1, 3]);
    const unknown = s.issues.unknown_categories;
    // Names come from the imported file: untrusted text (T-15-63).
    expect(unknown.map((u: any) => u.name.untrusted_user_text).sort()).toEqual(["Groceriez", "Pets"]);
    expect(unknown.find((u: any) => u.name.untrusted_user_text === "Groceriez").suggestions).toContain("Groceries");
    expect(s.issues.fx_gaps.map((g: any) => g.index)).toEqual([6]);
    expect(s.issues.invalid_rows.map((g: any) => g.index)).toEqual([7]);
  });

  it("refuses more than 500 rows", async () => {
    const rows = Array.from({ length: 501 }, () => txn("2026-02-10", fuel, "1.00"));
    const r = await tool("import_preview", { budget_id: budgetId, kind: "transactions", rows });
    expect(r.isError).toBe(true);
    expect(errorOf(r).error).toBe("too_many_rows");
  });

  // One valid and one invalid row per kind: each kind has its own row schema.
  const KINDS: Array<[string, () => unknown, unknown]> = [
    ["transactions", () => txn("2026-02-25", fuel, "3.00"), txn("2026-02-25", fuel, "abc")],
    ["category_limits", () => ({ category: "Fuel", month: "2026-04", amount: "300.00" }), { category: "Fuel", month: "2026-4", amount: "1" }],
    [
      "investment_entries",
      () => ({ side: "buy", asset_id: btc, date: "2026-03-05", quantity: "0.5", price: "1000.00", currency: "PLN" }),
      { side: "hold", date: "2026-03-05" },
    ],
    ["wallet_balances", () => ({ wallet_id: walletId, date: "2026-03-05", balance: "100.00", currency: "PLN" }), { wallet_id: walletId, date: "x", balance: "1" }],
    [
      "scheduled_payments",
      () => ({ category: "Fuel", amount: "20.00", currency: "PLN", note: "Car wash", first_due_date: "2027-01-05", cadence: "MONTHLY", cadence_anchor: 5 }),
      { category: "Fuel", amount: "20.00", cadence: "HOURLY" },
    ],
  ];
  for (const [kind, valid, invalid] of KINDS)
    it(`${kind}: its own row schema`, async () => {
      const before = await counts();
      const r = await tool("import_preview", { budget_id: budgetId, kind, rows: [valid(), invalid] });
      expect(r.isError).toBeFalsy();
      expect(r.structuredContent!.issues.invalid_rows.map((x: any) => x.index)).toEqual([1]);
      expect(await counts()).toEqual(before);
    });

  it("category_limits: unknown names come with suggestions", async () => {
    const r = await tool("import_preview", {
      budget_id: budgetId,
      kind: "category_limits",
      rows: [{ category: "Fule", month: "2026-04", amount: "300.00" }, { category: "Fuel", month: "2026-04", no_limit: true }],
    });
    expect(r.structuredContent!.issues.unknown_categories[0]).toMatchObject({ name: { untrusted_user_text: "Fule" }, rows: [0] });
    expect(r.structuredContent!.issues.unknown_categories[0].suggestions).toContain("Fuel");
  });

  it("investment_entries: sorted per asset; a row older than the latest entry blocks", async () => {
    const r = await tool("import_preview", {
      budget_id: budgetId,
      kind: "investment_entries",
      rows: [
        { side: "buy", new_asset: { name: "ETH", type: "crypto" }, date: "2024-03-01", quantity: "1", price: "10.00", currency: "PLN" },
        { side: "buy", new_asset: { name: "ETH", type: "crypto" }, date: "2024-01-01", quantity: "1", price: "10.00", currency: "PLN" },
        { side: "buy", new_asset: { name: "ETH", type: "crypto" }, date: "2024-02-01", quantity: "1", price: "10.00", currency: "PLN" },
        { side: "buy", asset_id: btc, date: "2026-02-01", quantity: "1", price: "10.00", currency: "PLN" },
      ],
    });
    const s = r.structuredContent!;
    expect(s.clean).toBe(false);
    expect(s.issues.older_than_latest_entry).toEqual([{ index: 3, latest: "2026-03-01" }]);
    expect(s.order).toEqual([1, 2, 0, 3]);
  });

  it("wallet_balances: only the newest per wallet applies; unknown wallet is invalid", async () => {
    const row = (date: string, wallet_id = walletId) => ({ wallet_id, date, balance: "10.00", currency: "PLN" });
    const r = await tool("import_preview", {
      budget_id: budgetId,
      kind: "wallet_balances",
      rows: [row("2026-01-01"), row("2026-03-01"), row("2026-02-01"), row("2026-03-01", crypto.randomUUID())],
    });
    const s = r.structuredContent!;
    expect(s.issues.history_not_stored.map((x: any) => x.index).sort()).toEqual([0, 2]);
    expect(s.issues.invalid_rows.map((x: any) => x.index)).toEqual([3]);
  });

  it("wallet_balances history alone keeps the preview clean", async () => {
    const row = (date: string) => ({ wallet_id: walletId, date, balance: "10.00", currency: "PLN" });
    const r = await tool("import_preview", { budget_id: budgetId, kind: "wallet_balances", rows: [row("2026-01-01"), row("2026-03-01")] });
    expect(r.structuredContent!.clean).toBe(true);
  });

  it("scheduled_payments: an existing one is a duplicate; unknown category reported", async () => {
    await cookie("POST", `/budgets/${budgetId}/scheduled-payments`, {
      category_id: fuel,
      amount: "55.00",
      currency: "PLN",
      note: "Gym",
      first_due_date: "2027-02-01",
      cadence: "MONTHLY",
      cadence_anchor: 1,
    });
    const sp = (extra: Record<string, unknown>) => ({
      category: "Fuel",
      amount: "55.00",
      currency: "PLN",
      note: "Gym",
      first_due_date: "2027-02-01",
      cadence: "MONTHLY",
      cadence_anchor: 1,
      ...extra,
    });
    const r = await tool("import_preview", {
      budget_id: budgetId,
      kind: "scheduled_payments",
      rows: [sp({}), sp({ category: "Gymm", note: "Other" })],
    });
    const s = r.structuredContent!;
    expect(s.issues.duplicates.map((d: any) => d.index)).toEqual([0]);
    expect(s.issues.unknown_categories[0].name.untrusted_user_text).toBe("Gymm");
  });
});

describe("import_commit", () => {
  const preview = async (rows: unknown[], c = client) =>
    (await tool("import_preview", { budget_id: budgetId, kind: "transactions", rows }, c)).structuredContent!;

  it("commits a clean preview under one batch, then the preview is gone", async () => {
    const before = await counts();
    const p = await preview([txn("2026-02-26", fuel, "7.00"), txn("2026-02-26", "Groceries", "8.00")]);
    const r = await tool("import_commit", { preview_id: p.preview_id });
    expect(r.isError).toBeFalsy();
    expect(r.structuredContent).toMatchObject({ created: 2, skipped: 0 });
    expect(r.structuredContent!.batch_id).toBeString();
    expect((await counts()).txns).toBe(before.txns + 2);
    const again = await tool("import_commit", { preview_id: p.preview_id });
    expect(errorOf(again).error).toBe("preview_expired");
  });

  it("refuses an unclean preview without resolutions; nothing written", async () => {
    const before = await counts();
    const p = await preview([txn("2026-02-27", "Pets", "3.00")]);
    const r = await tool("import_commit", { preview_id: p.preview_id });
    expect(r.isError).toBe(true);
    expect(errorOf(r)).toMatchObject({ error: "unresolved_issues", missing: ["category_map:Pets"] });
    expect(await counts()).toEqual(before);
  });

  it("applies resolutions: map, create, skip dupes and FX gaps", async () => {
    const before = await counts();
    const p = await preview([
      txn("2026-02-03", "Groceries", "12.50"), // dupe → skipped
      txn("2026-02-28", "Groceriez", "5.00"), // mapped to Groceries
      txn("2026-02-28", "Pets", "6.00"), // created
      txn(GAP_DATE, "Fuel", "10.00", { currency: "USD" }), // gap → skipped
    ]);
    const r = await tool("import_commit", {
      preview_id: p.preview_id,
      resolutions: {
        duplicates: "skip_all",
        category_map: { Groceriez: groceries, Pets: { create: { name: "Pets" } } },
        fx_gaps: "skip_rows",
      },
    });
    expect(r.isError).toBeFalsy();
    expect(r.structuredContent).toMatchObject({ created: 2, skipped: 2, categories_created: 1 });
    const after = await counts();
    expect(after.txns).toBe(before.txns + 2);
    expect(after.categories).toBe(before.categories + 1);
  });

  it("refuses a category_map value that is not a category of this budget", async () => {
    const before = await counts();
    const p = await preview([txn("2026-02-28", "Toys", "1.00")]);
    const r = await tool("import_commit", {
      preview_id: p.preview_id,
      resolutions: { category_map: { Toys: crypto.randomUUID() } },
    });
    expect(errorOf(r).error).toBe("invalid_category_map");
    expect(await counts()).toEqual(before);
  });

  it("a USD row keeps USD and converts at that date's rate (D-18)", async () => {
    const p = await preview([txn("2026-02-14", fuel, "10.00", { currency: "USD" })]);
    const r = await tool("import_commit", { preview_id: p.preview_id });
    expect(r.isError).toBeFalsy();
    const found = (await cookie("GET", `/budgets/${budgetId}/transactions/search?from=2026-02-14&to=2026-02-14`)) as any;
    // The converted figure is re-expressed at read time (Phase 14); the
    // stored rate is the row's date's.
    expect(found.transactions[0]).toMatchObject({
      currency_original: "USD",
      amount_original_cents: "1000",
      fx_rate: "4.00000000",
      fx_as_of: "2026-02-14",
    });
  });

  it(
    "mid-batch failure rolls back everything, created categories included",
    async () => {
      // The route is the authority: Feb 30 passes the preview's shape check
      // and the route refuses it at row 7.
      const rows = Array.from({ length: 10 }, (_, i) =>
        txn(i === 6 ? "2026-02-30" : `2026-01-${String(20 + i).padStart(2, "0")}`, i === 2 ? "Hobby" : fuel, `${i + 1}.25`),
      );
      const p = await preview(rows);
      const before = await counts();
      const r = await tool("import_commit", {
        preview_id: p.preview_id,
        resolutions: { category_map: { Hobby: { create: { name: "Hobby" } } } },
      });
      expect(r.isError).toBe(true);
      const e = errorOf(r);
      expect(e.error).toBe("import_rolled_back");
      expect(e.row_index).toBe(6);
      expect(e.row_error).toBeString();
      expect(e.failed_inverses).toEqual([]);
      expect(await counts()).toEqual(before);
      const all = (await cookie("GET", `/budgets/${budgetId}/categories?includeArchived=true`)) as any;
      expect(all.categories.some((c: any) => c.name === "Hobby")).toBe(false);
      const retry = await tool("import_commit", { preview_id: p.preview_id });
      expect(errorOf(retry).error).toBe("preview_expired");
    },
    60_000,
  );

  it("import_undo reverts a committed batch; a created category is archived", async () => {
    const before = await counts();
    const p = await preview([txn("2026-01-05", "Books", "9.00"), txn("2026-01-06", fuel, "9.00")]);
    const done = await tool("import_commit", {
      preview_id: p.preview_id,
      resolutions: { category_map: { Books: { create: { name: "Books" } } } },
    });
    const r = await tool("import_undo", { batch_id: done.structuredContent!.batch_id });
    expect(r.isError).toBeFalsy();
    expect(r.structuredContent!.reverted).toBe(3);
    const after = await counts();
    expect(after.txns).toBe(before.txns);
    expect(after.categories).toBe(before.categories);
    expect(after.allCategories).toBe(before.allCategories + 1);
  }, 30_000);

  it("the daily cap refuses the whole commit before writing", async () => {
    const t = await mintMcpToken(app, a, ["read", "write"]);
    const capped = await createSdkClient(app, t.accessToken);
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
          entryCount: 4995,
        },
      ]),
    );
    const before = await counts();
    const rows = Array.from({ length: 10 }, (_, i) => txn("2026-01-02", fuel, `${i + 1}.75`));
    const p = await preview(rows, capped);
    const r = await tool("import_commit", { preview_id: p.preview_id }, capped);
    expect(errorOf(r).error).toBe("daily_entry_limit");
    expect(await counts()).toEqual(before);
  });

  it("a preview belongs to its connection", async () => {
    const t = await mintMcpToken(app, a, ["read", "write"]);
    const other = await createSdkClient(app, t.accessToken);
    const p = await preview([txn("2026-01-03", fuel, "1.00")]);
    expect(errorOf(await tool("import_commit", { preview_id: p.preview_id }, other)).error).toBe("preview_expired");
  });
});
