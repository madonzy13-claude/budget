/**
 * import-kinds.test.ts — 15-20: import_commit for category_limits,
 * scheduled_payments, investment_entries and wallet_balances. Each kind
 * commits through the app's routes, rolls back to zero changes on a
 * mid-batch failure (D-15), and is undone by import_undo with the 15-15
 * agent rules. Real app, real tokens, real Postgres.
 */
import { describe, it, expect, beforeAll } from "bun:test";
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

type App = Awaited<ReturnType<typeof testApp>>;
type Client = Awaited<ReturnType<typeof createSdkClient>>;
type Result = {
  isError?: boolean;
  structuredContent?: Record<string, any>;
  content: Array<{ text: string }>;
};

let app: App;
let a: TestUser;
let b: string;
let client: Client;

async function cookie(method: string, path: string, body?: unknown, ok = true) {
  const res = await app.fetch(
    new Request(`${baseUrl()}${path}`, {
      method,
      headers: { cookie: a.cookie, "x-budget-id": b, "content-type": "application/json" },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    }),
  );
  if (ok && !res.ok) throw new Error(`${method} ${path} ${res.status} ${await res.text()}`);
  if (!res.ok) return null;
  return res.status === 204 ? null : res.json();
}

async function tool(name: string, args: Record<string, unknown>): Promise<Result> {
  clearRateLimits();
  return (await client.callTool({ name, arguments: args })) as Result;
}
const errorOf = (r: Result) => JSON.parse(r.content[0]!.text) as Record<string, any>;

async function preview(kind: string, rows: unknown[]) {
  const r = await tool("import_preview", { budget_id: b, kind, rows });
  expect(r.isError).toBeFalsy();
  return r.structuredContent!;
}
async function commit(previewId: string, resolutions?: Record<string, unknown>) {
  return tool("import_commit", { preview_id: previewId, ...(resolutions ? { resolutions } : {}) });
}

/** The entities an import batch logged, from list_recent_writes. */
async function logged(batchId: string) {
  const r = await tool("list_recent_writes", { limit: 50 });
  const w = (r.structuredContent!.writes as any[]).find((x) => x.batch_id === batchId);
  return (w?.entities ?? []) as Array<{ entity_type: string; entity_id: string }>;
}

const newCategory = async (name: string) =>
  ((await cookie("POST", `/budgets/${b}/categories`, { name })) as any).category.id as string;
const dropCategory = async (id: string) => {
  await cookie("POST", `/budgets/${b}/categories/${id}/archive`, {});
  await cookie("DELETE", `/budgets/${b}/categories/${id}`);
};
/** A month's limit, or "none" when the category is unbounded then. */
async function limitOf(catId: string, month: string) {
  const e = (await cookie("GET", `/budgets/${b}/categories/${catId}/limits/effective?date=${month}-01`, undefined, false)) as any;
  return !e || e.noLimit ? "none" : e.normalAmount;
}
const rules = async () =>
  (((await cookie("GET", `/budgets/${b}/scheduled-payments`)) as any).rules as any[]).map((r) => r.id).sort();
const holdings = async () => {
  const ids = new Set<string>();
  for (const q of ["", "?hidden=1"])
    for (const h of ((await cookie("GET", `/budgets/${b}/investments${q}`)) as any).holdings) ids.add(h.id);
  return ids;
};
const entries = async (asset: string) =>
  ((await cookie("GET", `/budgets/${b}/investments/${asset}/entries`)) as any).entries as Array<{
    id: string;
    effectiveDate: string;
  }>;
const balance = async (w: string) => ((await cookie("GET", `/wallets/${w}`)) as any).currentBalanceCents as string;
beforeAll(async () => {
  app = await testApp();
  a = await signUpTestUser(app);
  b = await seedBudget(a.userId, { currency: "PLN" });
  const t = await mintMcpToken(app, a, ["read", "write"]);
  client = await createSdkClient(app, t.accessToken);
}, 30_000);

describe("category_limits", () => {
  const M1 = "2026-08";
  const M2 = "2026-09";

  it("commits each (category, month) and logs one category_limit per row", async () => {
    const cats = [await newCategory("L Rent"), await newCategory("L Food"), await newCategory("L Fun")];
    const rows = cats.flatMap((cat, k) => [
      { category: cat, month: M1, amount: `${100 + k}` },
      { category: cat, month: M2, amount: `${200 + k}` },
    ]);
    const p = await preview("category_limits", rows);
    expect(p.clean).toBe(true);
    const r = await commit(p.preview_id);
    expect(r.isError).toBeFalsy();
    for (const [k, cat] of cats.entries()) {
      expect(await limitOf(cat, M1)).toBe(String((100 + k) * 100));
      expect(await limitOf(cat, M2)).toBe(String((200 + k) * 100));
    }
    const ents = await logged(r.structuredContent!.batch_id);
    expect(ents).toHaveLength(6);
    expect(ents.every((e) => e.entity_type === "category_limit")).toBe(true);
  }, 60_000);

  it("rolls back every limit, including months that had none, when row 4 fails", async () => {
    const [x, y, z] = [await newCategory("R A"), await newCategory("R B"), await newCategory("R C")];
    await cookie("POST", `/budgets/${b}/categories/${x}/limits`, {
      normalAmount: "5000",
      cushionAmount: "5000",
      effectiveFrom: `${M1}-01`,
      singleMonth: true,
    });
    const touched = [
      [x, M1],
      [x, M2],
      [y, M1],
      [y, M2],
    ] as const;
    const before = await Promise.all(touched.map(([c, m]) => limitOf(c, m)));
    const p = await preview("category_limits", [
      { category: x, month: M1, amount: "10" },
      { category: x, month: M2, amount: "11" },
      { category: y, month: M1, amount: "12" },
      { category: z, month: M1, amount: "13" },
      { category: z, month: M2, amount: "14" },
      { category: y, month: M2, amount: "15" },
    ]);
    await dropCategory(z);
    const r = await commit(p.preview_id);
    expect(r.isError).toBe(true);
    expect(errorOf(r)).toMatchObject({ error: "import_rolled_back", row_index: 3, failed_inverses: [] });
    expect(await Promise.all(touched.map(([c, m]) => limitOf(c, m)))).toEqual(before);
  }, 60_000);

  it("import_undo restores limits, skipping a month the user changed since", async () => {
    const cat = await newCategory("U Limits");
    const p = await preview("category_limits", [
      { category: cat, month: M1, amount: "70" },
      { category: cat, month: M2, amount: "80" },
    ]);
    const r = await commit(p.preview_id);
    await cookie("POST", `/budgets/${b}/categories/${cat}/limits`, {
      normalAmount: "9900",
      cushionAmount: "9900",
      effectiveFrom: `${M2}-01`,
      singleMonth: true,
    });
    const u = await tool("import_undo", { batch_id: r.structuredContent!.batch_id });
    expect(u.structuredContent).toMatchObject({ reverted: 1, skipped_changed_since: [cat] });
    expect(await limitOf(cat, M1)).toBe("none");
    expect(await limitOf(cat, M2)).toBe("9900");
  }, 60_000);
});

describe("scheduled_payments", () => {
  const row = (category: string, note: string) => ({
    category,
    amount: "30",
    currency: "PLN",
    note,
    first_due_date: "2026-12-05",
    cadence: "MONTHLY",
    cadence_anchor: 5,
  });

  it("commits each row as an app-shaped scheduled payment", async () => {
    const cat = await newCategory("S Subs");
    const before = await rules();
    const p = await preview("scheduled_payments", [row(cat, "a"), row(cat, "b"), row("s subs", "c")]);
    expect(p.clean).toBe(true);
    const r = await commit(p.preview_id);
    expect(r.isError).toBeFalsy();
    const after = await rules();
    expect(after.length - before.length).toBe(3);
    const ents = await logged(r.structuredContent!.batch_id);
    expect(ents.map((e) => e.entity_type)).toEqual(Array(3).fill("scheduled_payment"));
    const made = ((await cookie("GET", `/budgets/${b}/scheduled-payments`)) as any).rules.find(
      (x: any) => x.id === ents[0]!.entity_id,
    );
    expect(made).toMatchObject({ categoryId: cat, currency: "PLN", cadence: "MONTHLY" });
  }, 60_000);

  // The route refuses an end before the first payment (a deleted category
  // does not fail it), so row 3 carries one.
  it("rolls back to the list it started from when row 3 fails, and the preview is gone", async () => {
    const ok = await newCategory("S Ok");
    const before = await rules();
    const p = await preview("scheduled_payments", [
      row(ok, "1"),
      row(ok, "2"),
      { ...row(ok, "3"), end_date: "2026-12-01" },
    ]);
    const r = await commit(p.preview_id);
    expect(errorOf(r)).toMatchObject({ error: "import_rolled_back", row_index: 2, failed_inverses: [] });
    expect(await rules()).toEqual(before);
    expect(errorOf(await commit(p.preview_id)).error).toBe("preview_expired");
  }, 60_000);

  it("import_undo deletes them all but one the user edited since", async () => {
    const cat = await newCategory("S Undo");
    const before = await rules();
    const p = await preview("scheduled_payments", [row(cat, "x"), row(cat, "y"), row(cat, "z")]);
    const r = await commit(p.preview_id);
    const edited = (await logged(r.structuredContent!.batch_id))[0]!.entity_id;
    await cookie("PATCH", `/budgets/${b}/scheduled-payments/${edited}`, {
      edits: { amount: "31" },
      applyToFuture: true,
    });
    const u = await tool("import_undo", { batch_id: r.structuredContent!.batch_id });
    expect(u.structuredContent).toMatchObject({ reverted: 2, skipped_changed_since: [edited] });
    expect(await rules()).toEqual([...before, edited].sort());
  }, 60_000);
});

describe("investment_entries", () => {
  const buy = (date: string, extra: Record<string, unknown>) => ({
    side: "buy",
    date,
    quantity: "1",
    price: "100",
    currency: "PLN",
    ...extra,
  });

  it("a new asset's history, given out of order, is written oldest first", async () => {
    const asset = { name: "Gold bar", type: "precious_metals" };
    const p = await preview("investment_entries", [
      { side: "sell", date: "2024-03-10", quantity: "0.5", received: "60", currency: "PLN", new_asset: asset },
      buy("2024-01-10", { new_asset: asset }),
      buy("2024-02-10", { new_asset: asset, price: "110" }),
    ]);
    expect(p.clean).toBe(true);
    const r = await commit(p.preview_id);
    expect(r.isError).toBeFalsy();
    const ents = await logged(r.structuredContent!.batch_id);
    expect(ents.filter((e) => e.entity_type === "investment_asset")).toHaveLength(1);
    expect(ents.filter((e) => e.entity_type === "investment_entry")).toHaveLength(3);
    const id = ents.find((e) => e.entity_type === "investment_asset")!.entity_id;
    expect((await entries(id)).map((e) => e.effectiveDate).sort()).toEqual([
      "2024-01-10",
      "2024-02-10",
      "2024-03-10",
    ]);
  }, 60_000);

  it("rows for an existing asset land after its latest entry", async () => {
    const h = (await cookie("POST", `/budgets/${b}/investments`, {
      name: "Old ETF",
      holdingType: "equities",
      uiType: "stocks",
      quantity: "1",
      buyPriceCents: 10000,
      buyCurrency: "PLN",
      currentPriceCents: 10000,
      currentPriceCurrency: "PLN",
      openedOn: "2024-06-01",
    })) as any;
    const p = await preview("investment_entries", [
      buy("2024-08-01", { asset_id: h.id }),
      buy("2024-07-01", { asset_id: h.id }),
    ]);
    expect(p.clean).toBe(true);
    expect((await commit(p.preview_id)).isError).toBeFalsy();
    expect((await entries(h.id)).map((e) => e.effectiveDate).sort()).toEqual([
      "2024-06-01",
      "2024-07-01",
      "2024-08-01",
    ]);
  }, 60_000);

  it("a sell of more than held rolls the asset back to nothing", async () => {
    const asset = { name: "Too much", type: "precious_metals" };
    const before = await holdings();
    const p = await preview("investment_entries", [
      buy("2024-01-10", { new_asset: asset }),
      buy("2024-02-10", { new_asset: asset }),
      { side: "sell", date: "2024-03-10", quantity: "5", currency: "PLN", new_asset: asset },
    ]);
    const r = await commit(p.preview_id);
    expect(errorOf(r)).toMatchObject({ error: "import_rolled_back", row_index: 2, failed_inverses: [] });
    expect(await holdings()).toEqual(before);
  }, 60_000);

  it("import_undo deletes the entries newest-first and the asset with them", async () => {
    const asset = { name: "Undo me", type: "precious_metals" };
    const before = await holdings();
    const p = await preview("investment_entries", [
      buy("2024-01-10", { new_asset: asset }),
      buy("2024-02-10", { new_asset: asset }),
    ]);
    const r = await commit(p.preview_id);
    const u = await tool("import_undo", { batch_id: r.structuredContent!.batch_id });
    expect(u.structuredContent).toMatchObject({ reverted: 3, skipped_changed_since: [], failed_inverses: [] });
    expect(await holdings()).toEqual(before);
  }, 60_000);

  it("import_undo leaves an asset alone once the user added a newer entry (a1)", async () => {
    const asset = { name: "Kept", type: "precious_metals" };
    const p = await preview("investment_entries", [buy("2024-01-10", { new_asset: asset })]);
    const r = await commit(p.preview_id);
    const id = (await logged(r.structuredContent!.batch_id)).find((e) => e.entity_type === "investment_asset")!
      .entity_id;
    await cookie("POST", `/budgets/${b}/investments/${id}/buy`, {
      kind: "quantity",
      quantity: "1",
      priceCents: "10000",
      currency: "PLN",
      effectiveDate: "2024-05-01",
    });
    const u = await tool("import_undo", { batch_id: r.structuredContent!.batch_id });
    expect(u.structuredContent!.reverted).toBe(0);
    expect(u.structuredContent!.skipped_changed_since).toHaveLength(2);
    expect(await entries(id)).toHaveLength(2);
  }, 60_000);
});

/** Only these wallets stay active: a date must name every active wallet. */
async function onlyWallets(...names: Array<[string, string]>) {
  for (const w of ((await cookie("GET", "/wallets")) as any).wallets)
    await cookie("POST", `/wallets/${w.id}/archive`, {});
  const ids: string[] = [];
  for (const [name, currency] of names)
    ids.push(((await cookie("POST", "/wallets", { name, walletType: "SPENDINGS", currency })) as any).id);
  return ids;
}
const series = async (from: string, to: string) =>
  ((await cookie("GET", `/budgets/${b}/overview/wealth?from=${from}&to=${to}`)) as any).series as Array<{
    label: string;
    value_cents: string;
  }>;
/** The value at the end of `date` (the series carries the last point forward). */
const valueOn = (s: Array<{ label: string; value_cents: string }>, date: string) =>
  s.filter((p) => p.label.startsWith(date)).at(-1)?.value_cents;

describe("wallet_balances (decision b2: past balances become wealth points)", () => {
  it("a complete history writes one wealth point per date; the newest sets each balance", async () => {
    const [w, v] = await onlyWallets(["W main", "PLN"], ["V side", "PLN"]);
    const p = await preview("wallet_balances", [
      { wallet_id: w, date: "2023-01-31", balance: "100", currency: "PLN" },
      { wallet_id: v, date: "2023-01-31", balance: "10", currency: "PLN" },
      { wallet_id: w, date: "2023-02-28", balance: "200.50", currency: "PLN" },
      { wallet_id: v, date: "2023-02-28", balance: "50", currency: "PLN" },
    ]);
    expect(p.clean).toBe(true);
    expect(p.issues.history_not_stored).toBeUndefined();
    const r = await commit(p.preview_id);
    expect(r.isError).toBeFalsy();
    expect(await balance(w)).toBe("20050");
    expect(await balance(v)).toBe("5000");
    expect(r.structuredContent!.wallets).toEqual([
      { wallet_id: w, old_balance: "0.00", new_balance: "200.50", difference: "200.50", currency: "PLN" },
      { wallet_id: v, old_balance: "0.00", new_balance: "50.00", difference: "50.00", currency: "PLN" },
    ]);
    expect(r.structuredContent!.snapshots_created).toBe(2);
    const s = await series("2023-01-01", "2023-03-31");
    expect(valueOn(s, "2023-01-31")).toBe("11000");
    expect(valueOn(s, "2023-02-28")).toBe("25050");
    expect((await logged(r.structuredContent!.batch_id)).map((e) => e.entity_type).sort()).toEqual([
      "wallet",
      "wallet",
      "wealth_snapshot",
      "wealth_snapshot",
    ]);
  }, 60_000);

  it("a date missing a wallet blocks until skipped; it then gets no point", async () => {
    const [w, v] = await onlyWallets(["W gap", "PLN"], ["V gap", "PLN"]);
    const p = await preview("wallet_balances", [
      { wallet_id: w, date: "2023-03-31", balance: "100", currency: "PLN" },
      { wallet_id: w, date: "2023-04-30", balance: "300", currency: "PLN" },
      { wallet_id: v, date: "2023-04-30", balance: "30", currency: "PLN" },
    ]);
    expect(p.clean).toBe(false);
    expect(p.issues.incomplete_wallet_set).toEqual([{ date: "2023-03-31", missing_wallets: [v] }]);
    expect(errorOf(await commit(p.preview_id)).missing).toEqual(["incomplete_wallet_set"]);
    const r = await commit(p.preview_id, { incomplete_wallet_set: "skip_dates" });
    expect(r.structuredContent!.snapshots_created).toBe(1);
    expect(await balance(w)).toBe("30000");
    const s = await series("2023-03-01", "2023-04-30");
    expect(valueOn(s, "2023-03-31")).toBe(valueOn(s, "2023-03-30"));
    expect(valueOn(s, "2023-04-30")).toBe("33000");
  }, 60_000);

  it("a wallet failing after the points were written rolls everything back", async () => {
    // A balance in a currency other than the wallet's own is refused (WALT-04);
    // an archived wallet still takes one.
    const [w, v] = await onlyWallets(["W roll", "PLN"], ["V roll", "EUR"]);
    await cookie("PUT", `/wallets/${w}/balance`, { amount: "10", currency: "PLN" });
    const before = await series("2023-05-01", "2023-06-30");
    const p = await preview("wallet_balances", [
      { wallet_id: w, date: "2023-05-31", balance: "999", currency: "PLN" },
      { wallet_id: v, date: "2023-05-31", balance: "1", currency: "PLN" },
    ]);
    const r = await commit(p.preview_id);
    expect(errorOf(r)).toMatchObject({ error: "import_rolled_back", row_index: 1, failed_inverses: [] });
    expect(await balance(w)).toBe("1000");
    expect(await series("2023-05-01", "2023-06-30")).toEqual(before);
  }, 60_000);

  it("import_undo removes the points and restores balances, skipping a wallet changed since", async () => {
    const [w, v] = await onlyWallets(["W undo", "PLN"], ["V undo", "PLN"]);
    const before = await series("2023-07-01", "2023-08-31");
    const p = await preview("wallet_balances", [
      { wallet_id: w, date: "2023-07-31", balance: "70", currency: "PLN" },
      { wallet_id: v, date: "2023-07-31", balance: "80", currency: "PLN" },
    ]);
    const r = await commit(p.preview_id);
    await cookie("PUT", `/wallets/${v}/balance`, { amount: "81", currency: "PLN" });
    const u = await tool("import_undo", { batch_id: r.structuredContent!.batch_id });
    expect(u.structuredContent).toMatchObject({ reverted: 2, skipped_changed_since: [v] });
    expect(await balance(w)).toBe("0");
    expect(await balance(v)).toBe("8100");
    expect(await series("2023-07-01", "2023-08-31")).toEqual(before);
  }, 60_000);
});
