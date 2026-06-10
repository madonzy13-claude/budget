/**
 * reserves-golden.steps.ts — drives the canonical reserve golden table through
 * the real UI and asserts every visible cell after each action.
 *
 * Seeding is via the API (categories + limits + the RESERVE wallet); the
 * timeline itself is driven entirely through real UI gestures so react-query
 * cache invalidation is exercised on every mutation. See ReservesGoldenPage and
 * fixtures/reserves-golden-data.ts.
 *
 * "I am signed in as a fresh user with workspace {string}" lives in
 * budget.steps.ts and stores the budget id in scenarioCtx.workspaceId.
 */
import { expect } from "@playwright/test";
import { createBdd } from "playwright-bdd";
import { test } from "../fixtures/index.js";
import {
  ReservesGoldenPage,
  type ActionTab,
} from "../pages/ReservesGoldenPage.js";
import {
  loadGoldenRows,
  realMonth,
  type GoldenRow,
} from "../fixtures/reserves-golden-data.js";

// The golden CSV's first month (2026-06) maps to real May (2026-05); seed the
// initial limits effective from there so they apply across the whole walk.
const FIRST_MONTH = realMonth("2026-06"); // "2026-05"

const { Given, When, Then } = createBdd(test);

function budgetIdOf(scenarioCtx: Record<string, unknown>): string {
  const id = scenarioCtx["workspaceId"] as string | undefined;
  if (!id)
    throw new Error(
      "scenarioCtx.workspaceId unset — run 'I am signed in as a fresh user with workspace' first",
    );
  return id;
}

async function findCategoryId(
  page: import("@playwright/test").Page,
  budgetId: string,
  name: string,
): Promise<string> {
  const res = await page.request.get(`/api/budgets/${budgetId}/categories`, {
    headers: { "X-Budget-ID": budgetId },
  });
  if (!res.ok()) throw new Error(`GET /categories failed: ${res.status()}`);
  const data = (await res.json()) as {
    categories?: Array<{ id: string; name: string }>;
    data?: Array<{ id: string; name: string }>;
  };
  const list = data.categories ?? data.data ?? [];
  const found = list.find((c) => c.name === name);
  if (!found) throw new Error(`category "${name}" not found`);
  return found.id;
}

/** Create one category and pin its normal + cushion limit from the month start. */
async function seedCategory(
  page: import("@playwright/test").Page,
  budgetId: string,
  name: string,
  normalMajor: number,
  cushionMajor: number,
): Promise<void> {
  const catRes = await page.request.post(
    `/api/budgets/${budgetId}/categories`,
    {
      headers: {
        "Idempotency-Key": crypto.randomUUID(),
        "X-Budget-ID": budgetId,
      },
      data: { name, currency: "EUR" },
    },
  );
  if (![200, 201, 409].includes(catRes.status())) {
    throw new Error(
      `POST /categories failed: ${catRes.status()} ${await catRes.text()}`,
    );
  }
  const categoryId = await findCategoryId(page, budgetId, name);
  const limitRes = await page.request.post(
    `/api/categories/${categoryId}/limits`,
    {
      headers: {
        "Idempotency-Key": crypto.randomUUID(),
        "X-Budget-ID": budgetId,
      },
      data: {
        normalAmount: String(Math.round(normalMajor * 100)),
        cushionAmount: String(Math.round(cushionMajor * 100)),
        normalCurrency: "EUR",
        // Effective from the FIRST timeline month (May) so the whole walk sees it.
        effectiveFrom: `${FIRST_MONTH}-01`,
      },
    },
  );
  if (![200, 201, 409].includes(limitRes.status())) {
    throw new Error(
      `POST /limits failed: ${limitRes.status()} ${await limitRes.text()}`,
    );
  }
}

// ── Given — seed categories (Grocery 300/300, Housing 500/250) + Vault wallet ──

Given(
  "the reserves golden fixture is seeded for {string}",
  async ({ page, scenarioCtx }) => {
    const ctx = scenarioCtx as unknown as Record<string, unknown>;
    const budgetId = budgetIdOf(ctx);
    // Order defines column order on the grid: Grocery first, Housing second.
    await seedCategory(page, budgetId, "Grocery", 300, 300);
    await seedCategory(page, budgetId, "Housing", 500, 250);
    // One RESERVE wallet drives userDefined; starts at 0 (golden row 0).
    const walletRes = await page.request.post("/api/wallets", {
      headers: {
        "Idempotency-Key": crypto.randomUUID(),
        "X-Budget-ID": budgetId,
      },
      data: { name: "Vault", walletType: "RESERVE", currency: "EUR" },
    });
    if (![200, 201].includes(walletRes.status())) {
      throw new Error(
        `POST /wallets failed: ${walletRes.status()} ${await walletRes.text()}`,
      );
    }
  },
);

// ── When — replay the whole timeline through the UI ───────────────────────────

async function performAction(
  g: ReservesGoldenPage,
  row: GoldenRow,
  prevRow: GoldenRow | undefined,
): Promise<ActionTab> {
  const a = row.action;
  const view = realMonth(row.view); // real month whose grid this row asserts
  let m: RegExpMatchArray | null;
  if (a === "starting point") return "other"; // assert the seeded initial state
  // "viewing July spendings" is a no-op mutation — just switch the viewed month.
  if (a === "viewing July spendings") {
    await g.gotoSpendings(view);
    return "spendings";
  }
  if ((m = a.match(/^set userDefined (-?\d+)$/))) return g.setUserDefined(m[1]);
  if ((m = a.match(/^adjust (Grocery|Housing) reserve to (-?\d+)$/))) {
    // The cover popup fires only when the raise covers existing overspend:
    // the category had overspent last row AND used reserve goes up this row.
    const cells = m[1] === "Grocery" ? row.G : row.H;
    const prevCells = prevRow
      ? m[1] === "Grocery"
        ? prevRow.G
        : prevRow.H
      : undefined;
    const expectCover =
      !!prevCells &&
      Number(prevCells.overspent) > 0 &&
      Number(cells.used) > Number(prevCells.used);
    return g.adjustReserve(m[1], m[2], expectCover);
  }
  if ((m = a.match(/^add (Grocery|Housing) txn (-?\d+)$/)))
    return g.addTxn(m[1], m[2], view);
  if ((m = a.match(/^remove (Grocery|Housing) txn (-?\d+)$/)))
    return g.removeTxn(m[1], m[2], view);
  if ((m = a.match(/^edit (Grocery|Housing) txn (-?\d+) to (-?\d+)$/)))
    return g.editTxn(m[1], m[2], m[3], view);
  if (a === "cushion off to on") return g.setCushionMode(true);
  if (a === "cushion on to off") return g.setCushionMode(false);
  if ((m = a.match(/^(Grocery|Housing) limit (-?\d+) to (-?\d+)$/))) {
    const cushion = m[1] === "Grocery" ? row.G.cushion : row.H.cushion;
    // effective from the month the change was made in (clock month).
    return g.setLimit(m[1], m[3], cushion, realMonth(row.when));
  }
  throw new Error(`unmapped golden action: "${a}"`);
}

When(
  "I replay the reserves golden timeline through the real UI",

  async ({ page, scenarioCtx, $testInfo }: any) => {
    // Full 41-row, two-month walk — ample room beyond the 30s default.
    if ($testInfo?.setTimeout) $testInfo.setTimeout(900_000);

    const ctx = scenarioCtx as Record<string, unknown>;
    const budgetId = budgetIdOf(ctx);
    const golden = new ReservesGoldenPage(page, budgetId);
    await golden.clearClock(); // start from the real clock (reset any prior run)
    try {
      await golden.resolveIds(["Grocery", "Housing"]);

      const allRows = loadGoldenRows();
      // GOLDEN_LIMIT=N runs only the first N rows (harness bring-up); 0 = all.
      const limit = Number(process.env.GOLDEN_LIMIT ?? "0");
      const rows = limit > 0 ? allRows.slice(0, limit) : allRows;

      let prevRow: GoldenRow | undefined;
      let curClock: string | null = null;
      for (const row of rows) {
        // Move the server clock to the month the action happened in (May→June).
        const clockMonth = realMonth(row.when);
        if (clockMonth !== curClock) {
          await golden.setClock(clockMonth);
          curClock = clockMonth;
        }
        const view = realMonth(row.view);
        const tab = await performAction(golden, row, prevRow);
        // Assert the action's own tab live (stale-cache guard), then the other.
        if (tab === "spendings") {
          await golden.assertSpendings(row, view);
          await golden.assertReserves(row);
        } else {
          await golden.assertReserves(row);
          await golden.assertSpendings(row, view);
        }
        prevRow = row;
      }
      ctx["goldenReplayDone"] = true;
    } finally {
      await golden.clearClock(); // ALWAYS restore the real clock
    }
  },
);

Then("every golden row matched the rendered cells", async ({ scenarioCtx }) => {
  const ctx = scenarioCtx as unknown as Record<string, unknown>;
  expect(ctx["goldenReplayDone"]).toBe(true);
});

// ── Closed-month adjust (golden rows 36-37) ───────────────────────────────────

Given(
  "the category {string} overspent {int} last month with a zero limit",
  async ({ page, scenarioCtx }, name: string, spendMajor: number) => {
    const ctx = scenarioCtx as Record<string, unknown>;
    const budgetId = budgetIdOf(ctx);
    const now = new Date();
    const lm = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const mm = String(lm.getMonth() + 1).padStart(2, "0");
    const lmStart = `${lm.getFullYear()}-${mm}-01`;
    const lmMid = `${lm.getFullYear()}-${mm}-15`;
    ctx["lmMonth"] = `${lm.getFullYear()}-${mm}`;

    const headers = {
      "Idempotency-Key": crypto.randomUUID(),
      "X-Budget-ID": budgetId,
    };
    await page.request.post(`/api/budgets/${budgetId}/categories`, {
      headers,
      data: { name, currency: "EUR" },
    });
    const categoryId = await findCategoryId(page, budgetId, name);
    // Zero limit effective from LAST month start (carries forward to this month),
    // so last month overspends by the full spend and this month has limit 0 too.
    const limRes = await page.request.post(
      `/api/categories/${categoryId}/limits`,
      {
        headers: {
          "Idempotency-Key": crypto.randomUUID(),
          "X-Budget-ID": budgetId,
        },
        data: {
          normalAmount: "0",
          cushionAmount: "0",
          normalCurrency: "EUR",
          effectiveFrom: lmStart,
        },
      },
    );
    if (![200, 201, 409].includes(limRes.status()))
      throw new Error(
        `seed limit failed: ${limRes.status()} ${await limRes.text()}`,
      );
    // Confirmed spend dated LAST month → overspent (limit 0). Same shape the
    // create-transaction hook POSTs (per-budget endpoint, no wallet needed).
    const tRes = await page.request.post(
      `/api/budgets/${budgetId}/transactions`,
      {
        headers: {
          "Idempotency-Key": crypto.randomUUID(),
          "X-Budget-ID": budgetId,
        },
        data: {
          date: lmMid,
          category_id: categoryId,
          amount_original_cents: Math.round(spendMajor * 100),
          currency_original: "EUR",
          note: null,
        },
      },
    );
    if (![200, 201, 409].includes(tRes.status()))
      throw new Error(
        `seed spend failed: ${tRes.status()} ${await tRes.text()}`,
      );
  },
);

When(
  "I set the {string} reserve to {string} on the reserves tab",
  async ({ page, scenarioCtx }, name: string, value: string) => {
    const ctx = scenarioCtx as Record<string, unknown>;
    const budgetId = budgetIdOf(ctx);
    await page.goto(`/en/budgets/${budgetId}/reserves`);
    await expect(page.getByTestId("reserves-totals-footer")).toBeVisible({
      timeout: 20000,
    });
    const row = page.locator("[data-category-id]", { hasText: name });
    await row.waitFor({ state: "visible", timeout: 15000 });
    const id = await row.getAttribute("data-category-id");
    ctx["closedCatId"] = id;
    await page.getByTestId(`reserves-balance-${id}`).click();
    const input = page
      .getByTestId(`reserves-balance-${id}-editor`)
      .locator("input");
    await input.waitFor({ state: "visible", timeout: 10000 });
    await input.fill(value);
    await input.press("Enter");
  },
);

Then("no reserve cover popup appears", async ({ page }) => {
  // Give the adjust mutation time to (not) raise the popup, then assert absence.
  await page.waitForTimeout(2000);
  await expect(page.getByTestId("reserve-cover-dialog")).toHaveCount(0);
});

Then(
  "the {string} available reserve shows {string}",
  async ({ page, scenarioCtx }, _name: string, value: string) => {
    const id = (scenarioCtx as Record<string, unknown>)["closedCatId"];
    await expect(page.getByTestId(`reserves-balance-${id}`)).toHaveText(value, {
      timeout: 10000,
    });
  },
);

Then(
  "viewing last month {string} shows overspent {string} and reserves-used {string}",
  async (
    { page, scenarioCtx },
    name: string,
    overspent: string,
    used: string,
  ) => {
    const ctx = scenarioCtx as Record<string, unknown>;
    const budgetId = budgetIdOf(ctx);
    const lm = ctx["lmMonth"] as string;
    await page.goto(`/en/budgets/${budgetId}/spendings?month=${lm}`);
    await expect(page.getByTestId("spendings-grid")).toBeVisible({
      timeout: 20000,
    });
    const c = name.toLowerCase();
    await expect(page.getByTestId(`column-header-${c}-overspent`)).toHaveText(
      overspent,
      { timeout: 10000 },
    );
    await expect(
      page.getByTestId(`column-header-${c}-reserves-used`),
    ).toHaveText(used, { timeout: 10000 });
  },
);

Given(
  "the category {string} also overspent {int} this month",
  async ({ page, scenarioCtx }, name: string, spendMajor: number) => {
    const budgetId = budgetIdOf(scenarioCtx as Record<string, unknown>);
    const categoryId = await findCategoryId(page, budgetId, name);
    const today = new Date().toISOString().slice(0, 10);
    const tRes = await page.request.post(
      `/api/budgets/${budgetId}/transactions`,
      {
        headers: {
          "Idempotency-Key": crypto.randomUUID(),
          "X-Budget-ID": budgetId,
        },
        data: {
          date: today,
          category_id: categoryId,
          amount_original_cents: Math.round(spendMajor * 100),
          currency_original: "EUR",
          note: null,
        },
      },
    );
    if (![200, 201, 409].includes(tRes.status()))
      throw new Error(
        `seed this-month spend failed: ${tRes.status()} ${await tRes.text()}`,
      );
  },
);

When(
  "I set the {string} reserve to {string} and acknowledge the cover popup",
  async ({ page, scenarioCtx }, name: string, value: string) => {
    const ctx = scenarioCtx as Record<string, unknown>;
    const budgetId = budgetIdOf(ctx);
    await page.goto(`/en/budgets/${budgetId}/reserves`);
    await expect(page.getByTestId("reserves-totals-footer")).toBeVisible({
      timeout: 20000,
    });
    const row = page.locator("[data-category-id]", { hasText: name });
    await row.waitFor({ state: "visible", timeout: 15000 });
    const id = await row.getAttribute("data-category-id");
    ctx["closedCatId"] = id;
    await page.getByTestId(`reserves-balance-${id}`).click();
    const input = page
      .getByTestId(`reserves-balance-${id}-editor`)
      .locator("input");
    await input.waitFor({ state: "visible", timeout: 10000 });
    await input.fill(value);
    await input.press("Enter");
    await expect(page.getByTestId("reserve-cover-dialog")).toBeVisible({
      timeout: 10000,
    });
    await page.getByTestId("reserve-cover-ack").click();
    await expect(page.getByTestId("reserve-cover-dialog")).toBeHidden({
      timeout: 8000,
    });
  },
);

Then(
  "this month {string} shows overspent {string} and reserves-used {string}",
  async (
    { page, scenarioCtx },
    name: string,
    overspent: string,
    used: string,
  ) => {
    const budgetId = budgetIdOf(scenarioCtx as Record<string, unknown>);
    await page.goto(`/en/budgets/${budgetId}/spendings`);
    await expect(page.getByTestId("spendings-grid")).toBeVisible({
      timeout: 20000,
    });
    const c = name.toLowerCase();
    await expect(page.getByTestId(`column-header-${c}-overspent`)).toHaveText(
      overspent,
      { timeout: 10000 },
    );
    await expect(
      page.getByTestId(`column-header-${c}-reserves-used`),
    ).toHaveText(used, { timeout: 10000 });
  },
);
