import { expect, type Locator } from "@playwright/test";
import { createBdd } from "playwright-bdd";
import { test } from "../fixtures/fresh-user-per-scenario";
import { InvestmentsPo } from "../page-objects/InvestmentsPo";

const { Given, When, Then } = createBdd(test);

/**
 * Plan 09-05 scaffold step bindings for @investments-wallet.
 * The feature is @skip-phase-09-debt until Plan 09-07 builds the UI; these steps
 * exist now so 09-07 only flips the skip tag + implements the InvestmentsPo selectors.
 */

async function withBudgetGuc(
  budgetId: string,
  run: (client: import("pg").PoolClient) => Promise<void>,
): Promise<void> {
  const { Pool } = await import("pg");
  const dbUrl =
    process.env.DATABASE_URL_APP?.replace("@db:", "@localhost:") ?? "";
  if (!dbUrl)
    throw new Error("DATABASE_URL_APP not set — cannot seed investments");
  const pool = new Pool({ connectionString: dbUrl });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`SELECT set_config('app.tenant_ids', $1, true)`, [
      `{${budgetId}}`,
    ]);
    await run(client);
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
    await pool.end();
  }
}

/** 13.1 (D-35): every asset carries at least one ledger entry — seed the
 *  Start entry 0088 would have written, a month back so today's bookings
 *  append after it (D-15). */
async function addStart(
  client: import("pg").PoolClient,
  budgetId: string,
  name: string,
): Promise<void> {
  await client.query(
    `INSERT INTO budgeting.investment_history
       (tenant_id, budget_id, holding_id, kind, effective_date, amount_cents, amount_currency,
        qty_delta, cost_delta_cents, cost_currency, flow_cents, flow_currency)
     SELECT i.tenant_id, i.budget_id, i.id, 'start', current_date - 30, c.cost, c.ccy,
            CASE WHEN i.ui_type IN ('stocks','crypto','precious_metals') OR i.quantity <> 1
                 THEN i.quantity END,
            c.cost, c.ccy, c.cost, c.ccy
       FROM budgeting.investments i
       CROSS JOIN LATERAL (
         SELECT round(coalesce(i.buy_price_cents, 0) * i.quantity)::bigint AS cost,
                coalesce(i.buy_currency, i.current_price_currency, 'USD') AS ccy
       ) c
      WHERE i.budget_id = $1::uuid AND i.name = $2`,
    [budgetId, name],
  );
}

async function setInvestmentsEnabled(
  budgetId: string,
  enabled: boolean,
): Promise<void> {
  await withBudgetGuc(budgetId, async (client) => {
    await client.query(
      `UPDATE tenancy.budgets SET investments_enabled = $2 WHERE id = $1::uuid`,
      [budgetId, enabled],
    );
  });
}

Given("investments are enabled for my budget", async ({ freshUser }) => {
  await setInvestmentsEnabled(freshUser.budgetId, true);
});

Given("investments are disabled for my budget", async ({ freshUser }) => {
  await setInvestmentsEnabled(freshUser.budgetId, false);
});

Given(
  "a custom holding {string} worth {int} cents exists in my budget",
  async ({ freshUser }, name: string, amountCents: number) => {
    await withBudgetGuc(freshUser.budgetId, async (client) => {
      await client.query(
        `INSERT INTO budgeting.investments
           (id, tenant_id, budget_id, name, holding_type, quantity,
            current_price_cents, current_price_currency, sort_order, created_at)
         VALUES (gen_random_uuid(), $1::uuid, $1::uuid, $2, 'other', '1', $3, 'USD', 0, now())`,
        [freshUser.budgetId, name, amountCents],
      );
      await addStart(client, freshUser.budgetId, name);
    });
  },
);

When("I open the investments wallets tab", async ({ page, freshUser }) => {
  await page.goto(`/en/budgets/${freshUser.budgetId}/wallets`);
  await page
    .waitForLoadState("networkidle", { timeout: 10000 })
    .catch(() => {});
});

Then("I see the investments section", async ({ page }) => {
  await new InvestmentsPo(page).section().waitFor({ state: "visible" });
});

Then("I do not see the investments section", async ({ page }) => {
  await expect(new InvestmentsPo(page).section()).toHaveCount(0);
});

Then(
  "the investments section is the last wallets section",
  async ({ page }) => {
    await new InvestmentsPo(page).assertSectionIsLast();
  },
);

When(
  "I add a custom holding {string} worth {int} cents via the sheet",
  async ({ page }, name: string, amountCents: number) => {
    await new InvestmentsPo(page).addCustomHolding(name, amountCents);
  },
);

When(
  "I add a savings holding {string} starting {string} current {string} via the sheet",
  async ({ page }, name: string, starting: string, current: string) => {
    await new InvestmentsPo(page).addSavingsHolding(name, starting, current);
  },
);

Then("the holding row {string} is visible", async ({ page }, name: string) => {
  await new InvestmentsPo(page).row(name).waitFor({ state: "visible" });
});

Then(
  "the holding row {string} has no inline amount input",
  async ({ page }, name: string) => {
    await expect(
      new InvestmentsPo(page).row(name).locator("input"),
    ).toHaveCount(0);
  },
);

// Persistence guard (regression for the /investments path 404 that the optimistic
// insert masked): a real reload must still show the row from the server.
Then(
  "the holding row {string} persists after a reload",
  async ({ page }, name: string) => {
    await page.reload();
    await page
      .waitForLoadState("networkidle", { timeout: 10000 })
      .catch(() => {});
    await new InvestmentsPo(page).row(name).waitFor({ state: "visible" });
  },
);

// Distinct phrasing from the global "I reload the page" (workspace.steps.ts) so
// this feature stays on a single test fixture (fresh-user-per-scenario).
When("I reload the wallets tab", async ({ page }) => {
  await page.reload();
  await page
    .waitForLoadState("networkidle", { timeout: 10000 })
    .catch(() => {});
});

Then(
  "the holding {string} appears without a page reload",
  async ({ page }, name: string) => {
    // No page.reload() here — the optimistic mutation (INV-16) must surface the
    // row from cache alone.
    await new InvestmentsPo(page).row(name).waitFor({ state: "visible" });
  },
);

Given(
  "a custom holding {string} of {int} units at {int} cents each exists in my budget",
  async ({ freshUser }, name: string, qty: number, priceCents: number) => {
    await withBudgetGuc(freshUser.budgetId, async (client) => {
      await client.query(
        `INSERT INTO budgeting.investments
           (id, tenant_id, budget_id, name, holding_type, quantity,
            current_price_cents, current_price_currency, sort_order, created_at)
         VALUES (gen_random_uuid(), $1::uuid, $1::uuid, $2, 'other', $3, $4, 'USD', 0, now())`,
        [freshUser.budgetId, name, String(qty), priceCents],
      );
      await addStart(client, freshUser.budgetId, name);
    });
  },
);

When(
  "I set the amount of holding {string} to {string}",
  async ({ page }, name: string, amount: string) => {
    const row = new InvestmentsPo(page).row(name);
    await row.locator('[data-testid^="holding-amount-"]').click();
    const input = row.locator("input");
    await input.fill(amount);
    const saved = page.waitForResponse(
      (r) =>
        r.request().method() === "PATCH" && r.url().includes("/investments/"),
    );
    await input.press("Enter");
    expect((await saved).ok()).toBe(true);
  },
);

Then(
  "the holding {string} is priced at {string} cents per unit",
  async ({ freshUser }, name: string, priceCents: string) => {
    let stored = "";
    await withBudgetGuc(freshUser.budgetId, async (client) => {
      const r = await client.query<{ p: string }>(
        `SELECT current_price_cents::text AS p FROM budgeting.investments
          WHERE budget_id = $1::uuid AND name = $2`,
        [freshUser.budgetId, name],
      );
      stored = r.rows[0]?.p ?? "";
    });
    expect(Number(stored)).toBe(Number(priceCents));
  },
);

Then(
  "the holding row {string} shows the amount {string}",
  async ({ page }, name: string, amount: string) => {
    await expect(
      new InvestmentsPo(page)
        .row(name)
        .locator('[data-testid^="holding-amount-"]'),
    ).toHaveText(amount);
  },
);

When("I collapse the {string} type block", async ({ page }, uiType: string) => {
  await page.getByTestId(`investment-group-chevron-${uiType}`).click();
});

Then(
  "the {string} type block is collapsed",
  async ({ page }, uiType: string) => {
    await expect(
      page.getByTestId(`investment-group-chevron-${uiType}`),
    ).toHaveAttribute("aria-expanded", "false");
  },
);

Then("the holding row {string} is hidden", async ({ page }, name: string) => {
  await expect(new InvestmentsPo(page).row(name)).toHaveCount(0);
});

Then(
  "the amounts inside the {string} type block are narrower than its total",
  async ({ page }, uiType: string) => {
    const box = (scope: Locator) =>
      scope.locator('[style*="min-width"]').first().boundingBox();
    const header = await box(page.getByTestId(`investment-group-${uiType}`));
    const rows = new InvestmentsPo(page);
    const a = await box(rows.row("Flat A"));
    const b = await box(rows.row("Flat B"));
    expect(header && a && b).toBeTruthy();
    // Rows line up with each other…
    expect(Math.abs(a!.x - b!.x)).toBeLessThan(1);
    // …on their own width, not the block total's.
    expect(a!.width).toBeLessThan(header!.width - 2);
  },
);

Given(
  "a deposit {string} of {int} cents exists in my budget",
  async ({ freshUser }, name: string, cents: number) => {
    await withBudgetGuc(freshUser.budgetId, async (client) => {
      await client.query(
        `INSERT INTO budgeting.investments
           (id, tenant_id, budget_id, name, holding_type, ui_type, quantity,
            buy_price_cents, buy_currency, current_price_cents, current_price_currency,
            deposit_rate_bps, deposit_start_date, deposit_cap_frequency, sort_order, created_at)
         VALUES (gen_random_uuid(), $1::uuid, $1::uuid, $2, 'deposit', 'deposit', '1',
                 $3::bigint, 'USD', $3::numeric, 'USD', 0, CURRENT_DATE, 'monthly', 0, now())`,
        [freshUser.budgetId, name, cents],
      );
      await addStart(client, freshUser.budgetId, name);
    });
  },
);

When("I tap the amount of holding {string}", async ({ page }, name: string) => {
  await new InvestmentsPo(page)
    .row(name)
    .locator('[data-testid^="holding-amount-readonly-"]')
    .click();
});

Then(
  "the amount of holding {string} shakes",
  async ({ page }, name: string) => {
    // The attribute lives for one 0.32s animation, then clears itself.
    const amount = new InvestmentsPo(page)
      .row(name)
      .locator('[data-testid^="holding-amount-readonly-"]');
    await expect(amount).toHaveAttribute("data-shake", "true", {
      timeout: 300,
    });
    await expect(amount).not.toHaveAttribute("data-shake", /.*/);
  },
);

Given(
  "{int} custom holdings exist in my budget",
  async ({ freshUser }, count: number) => {
    await withBudgetGuc(freshUser.budgetId, async (client) => {
      await client.query(
        `INSERT INTO budgeting.investments
           (id, tenant_id, budget_id, name, holding_type, quantity,
            current_price_cents, current_price_currency, sort_order, created_at)
         SELECT gen_random_uuid(), $1::uuid, $1::uuid, 'Holding ' || n, 'other', '1',
                10000 * n, 'USD', n, now()
           FROM generate_series(1, $2::int) AS n`,
        [freshUser.budgetId, count],
      );
    });
  },
);

// ── Phase 13: type blocks (D-12/D-13) ──

Given(
  "a {string} holding {string} worth {int} cents exists in my budget",
  async ({ freshUser }, uiType: string, name: string, amountCents: number) => {
    await withBudgetGuc(freshUser.budgetId, async (client) => {
      await client.query(
        `INSERT INTO budgeting.investments
           (id, tenant_id, budget_id, name, holding_type, ui_type, quantity,
            buy_price_cents, buy_currency,
            current_price_cents, current_price_currency, sort_order, created_at)
         VALUES (gen_random_uuid(), $1::uuid, $1::uuid, $2,
                 CASE $3::text WHEN 'crypto' THEN 'crypto' WHEN 'cash' THEN 'cash_fx' ELSE 'other' END,
                 $3::text, '1', $4::bigint, 'USD', $4::numeric, 'USD', 0, now())`,
        [freshUser.budgetId, name, uiType, amountCents],
      );
      await addStart(client, freshUser.budgetId, name);
    });
  },
);

When(
  "I drag the {string} type block above the {string} type block",
  async ({ page }, a: string, b: string) => {
    await new InvestmentsPo(page).dragTypeBlockAbove(a, b);
  },
);

Then(
  "the type blocks are in order {string}",
  async ({ page }, order: string) => {
    const po = new InvestmentsPo(page);
    await expect
      .poll(() => po.typeBlockOrder())
      .toEqual(order.split(",").map((s) => s.trim()));
  },
);

// ── Phase 13: Sell (D-01/D-02/D-20) ──

Given(
  "a deposit {string} of {int} cents at {int}% yearly started a year ago exists in my budget",
  async ({ freshUser }, name: string, principal: number, pct: number) => {
    await withBudgetGuc(freshUser.budgetId, async (client) => {
      await client.query(
        `INSERT INTO budgeting.investments
           (id, tenant_id, budget_id, name, holding_type, ui_type, quantity,
            buy_price_cents, buy_currency, current_price_currency,
            deposit_rate_bps, deposit_start_date, deposit_cap_frequency,
            sort_order, created_at)
         VALUES (gen_random_uuid(), $1::uuid, $1::uuid, $2, 'deposit', 'deposit', '1',
                 $3::bigint, 'USD', 'USD', $4::int,
                 (current_date - interval '1 year')::date, 'yearly', 0, now())`,
        [freshUser.budgetId, name, principal, pct * 100],
      );
      await addStart(client, freshUser.budgetId, name);
    });
  },
);

When(
  "I sell {string} leaving {string} out of investments receiving {string}",
  async ({ page }, name: string, left: string, received: string) => {
    const po = new InvestmentsPo(page);
    await po.openSwap(name, "sell");
    expect(await po.sell({ left, dest: "out", received })).toBe(201);
  },
);

Then(
  "the deposit {string} restarts today with principal {int} cents",
  async ({ freshUser }, name: string, principal: number) => {
    let row: { p: string; d: string; today: string } | undefined;
    await withBudgetGuc(freshUser.budgetId, async (client) => {
      const r = await client.query<{ p: string; d: string; today: string }>(
        `SELECT buy_price_cents::text AS p, deposit_start_date::text AS d,
                current_date::text AS today
           FROM budgeting.investments WHERE budget_id = $1::uuid AND name = $2`,
        [freshUser.budgetId, name],
      );
      row = r.rows[0];
    });
    expect(row?.p).toBe(String(principal));
    expect(row?.d).toBe(row?.today);
  },
);

// 13.1 D-26: realized lives in the header's tap sum-up caption.
Then(
  "the {string} type shows realized {string}",
  async ({ page }, uiType: string, amount: string) => {
    const split = await new InvestmentsPo(page).typeSumUp(uiType);
    await expect(split.locator("[data-pl-caption]")).toContainText(
      `realized ${amount}`,
    );
  },
);

// ── Phase 13: seeding in the budget's own currency (no FX in E2E) ──

Given(
  "a {string} holding {string} deposited {int} cents worth {int} cents exists in my budget",
  async (
    { freshUser },
    uiType: string,
    name: string,
    buy: number,
    value: number,
  ) => {
    await withBudgetGuc(freshUser.budgetId, async (client) => {
      await client.query(
        `INSERT INTO budgeting.investments
           (id, tenant_id, budget_id, name, holding_type, ui_type, quantity,
            buy_price_cents, buy_currency, current_price_cents, current_price_currency,
            sort_order, created_at)
         SELECT gen_random_uuid(), $1::uuid, $1::uuid, $2,
                CASE $3::text WHEN 'cash' THEN 'cash_fx' WHEN 'savings' THEN 'savings' ELSE 'other' END,
                $3::text, '1', $4::bigint, b.default_currency, $5::numeric, b.default_currency,
                0, now()
           FROM tenancy.budgets b WHERE b.id = $1::uuid`,
        [freshUser.budgetId, name, uiType, buy, value],
      );
      await addStart(client, freshUser.budgetId, name);
    });
  },
);

Given(
  "a crypto holding {string} of {string} bought at {int} cents now {int} cents exists in my budget",
  async (
    { freshUser },
    name: string,
    qty: string,
    buy: number,
    price: number,
  ) => {
    await withBudgetGuc(freshUser.budgetId, async (client) => {
      await client.query(
        `INSERT INTO budgeting.investments
           (id, tenant_id, budget_id, name, holding_type, ui_type, quantity,
            buy_price_cents, buy_currency, current_price_cents, current_price_currency,
            sort_order, created_at)
         SELECT gen_random_uuid(), $1::uuid, $1::uuid, $2, 'crypto', 'crypto', $3::numeric,
                $4::bigint, b.default_currency, $5::numeric, b.default_currency, 0, now()
           FROM tenancy.budgets b WHERE b.id = $1::uuid`,
        [freshUser.budgetId, name, qty, buy, price],
      );
      await addStart(client, freshUser.budgetId, name);
    });
  },
);

When(
  "I sell {string} leaving {string} into a new cash holding {string} receiving {string}",
  async (
    { page },
    name: string,
    left: string,
    cash: string,
    received: string,
  ) => {
    const po = new InvestmentsPo(page);
    await po.openSwap(name, "sell");
    expect(await po.sell({ left, dest: "new", newName: cash, received })).toBe(
      201,
    );
  },
);

When(
  "I sell {string} leaving {string} into {string} receiving {string}",
  async (
    { page },
    name: string,
    left: string,
    target: string,
    received: string,
  ) => {
    const po = new InvestmentsPo(page);
    await po.openSwap(name, "sell");
    expect(
      await po.sell({ left, dest: "existing", existingName: target, received }),
    ).toBe(201);
  },
);

When("I open the sale of {string}", async ({ page }, name: string) => {
  await new InvestmentsPo(page).openSwap(name, "sell");
});

When(
  "I set {string} in the sale to {string}",
  async ({ page }, field: string, v: string) => {
    const id = field === "Value left" ? "swap-sell-left" : "swap-sell-received";
    await page.getByTestId("swap-sheet").getByTestId(id).fill(v);
  },
);

Then("the sale says {string}", async ({ page }, copy: string) => {
  await expect(page.getByTestId("swap-sheet").getByText(copy)).toBeVisible();
});

Then("the sale cannot be recorded", async ({ page }) => {
  await expect(page.getByTestId("swap-submit")).toBeDisabled();
});

Then("the sale date cannot be after today", async ({ page }) => {
  const today = new Date().toLocaleDateString("en-CA");
  await expect(page.getByTestId("swap-date")).toHaveAttribute("max", today);
});

Then(
  "the holding row {string} shows {string}",
  async ({ page }, name: string, text: string) => {
    await expect(new InvestmentsPo(page).row(name)).toContainText(text);
  },
);

Then("the holding row {string} is gone", async ({ page }, name: string) => {
  await expect(new InvestmentsPo(page).row(name)).toHaveCount(0);
});

Then("there is no {string} type block", async ({ page }, uiType: string) => {
  await expect(new InvestmentsPo(page).typeBlock(uiType)).toHaveCount(0);
});

Then("there is a {string} type block", async ({ page }, uiType: string) => {
  await expect(new InvestmentsPo(page).typeBlock(uiType)).toBeVisible();
});

Then("there is no realized line above the investments", async ({ page }) => {
  await expect(page.getByTestId("investments-total-realized")).toHaveCount(0);
});

Then(
  "the {string} type still books realized {int} cents",
  async ({ freshUser }, uiType: string, cents: number) => {
    let sum = "";
    await withBudgetGuc(freshUser.budgetId, async (client) => {
      const r = await client.query<{ s: string }>(
        `SELECT coalesce(sum(h.realized_budget_cents), 0)::text AS s
           FROM budgeting.investment_history h
           JOIN budgeting.investments i ON i.id = h.holding_id
          WHERE h.budget_id = $1::uuid AND i.ui_type = $2 AND h.deleted_at IS NULL`,
        [freshUser.budgetId, uiType],
      );
      sum = r.rows[0]?.s ?? "";
    });
    expect(sum).toBe(String(cents));
  },
);

Then(
  "the {string} type shows no realized gain",
  async ({ page }, uiType: string) => {
    const split = await new InvestmentsPo(page).typeSumUp(uiType);
    await expect(split.locator("[data-pl-caption]")).toContainText(
      "realized 0 ",
    );
  },
);

When(
  "I open the investments wallets tab in {string}",
  async ({ page, freshUser }, locale: string) => {
    await page.goto(`/${locale}/budgets/${freshUser.budgetId}/wallets`);
    await page
      .waitForLoadState("networkidle", { timeout: 10000 })
      .catch(() => {});
  },
);

When(
  "I add a broker {string} deposited {string} worth {string} opened on {string}",
  async ({ page }, name: string, dep: string, cur: string, date: string) => {
    await new InvestmentsPo(page).addBroker(name, dep, cur, date);
  },
);

// ── 13.1: assets, Swap, wallet target, ledger ──

Given(
  "a hidden {string} asset {string} exists in my budget",
  async ({ freshUser }, uiType: string, name: string) => {
    await withBudgetGuc(freshUser.budgetId, async (client) => {
      await client.query(
        `INSERT INTO budgeting.investments
           (id, tenant_id, budget_id, name, holding_type, ui_type, quantity,
            buy_price_cents, buy_currency, current_price_cents, current_price_currency,
            sort_order, created_at, archived_at)
         SELECT gen_random_uuid(), $1::uuid, $1::uuid, $2, 'other', $3, 0, 100,
                b.default_currency, 100, b.default_currency, 0, now(), now()
           FROM tenancy.budgets b WHERE b.id = $1::uuid`,
        [freshUser.budgetId, name, uiType],
      );
      await addStart(client, freshUser.budgetId, name);
    });
  },
);

Given(
  "a {string} asset {string} of {string} units at {int} cents exists in my budget",
  async (
    { freshUser },
    uiType: string,
    name: string,
    qty: string,
    price: number,
  ) => {
    await withBudgetGuc(freshUser.budgetId, async (client) => {
      await client.query(
        `INSERT INTO budgeting.investments
           (id, tenant_id, budget_id, name, holding_type, ui_type, quantity,
            buy_price_cents, buy_currency, current_price_cents, current_price_currency,
            sort_order, created_at)
         SELECT gen_random_uuid(), $1::uuid, $1::uuid, $2, 'other', $3, $4::numeric, $5::bigint,
                b.default_currency, $5::numeric, b.default_currency, 0, now()
           FROM tenancy.budgets b WHERE b.id = $1::uuid`,
        [freshUser.budgetId, name, uiType, qty, price],
      );
      await addStart(client, freshUser.budgetId, name);
    });
  },
);

Given(
  "a {string} wallet {string} with {int} cents exists in my budget",
  async ({ freshUser }, walletType: string, name: string, cents: number) => {
    await withBudgetGuc(freshUser.budgetId, async (client) => {
      await client.query(
        `INSERT INTO budgeting.wallets
           (id, tenant_id, name, wallet_type, currency, current_balance, created_at, actor_user_id, sort_order)
         SELECT gen_random_uuid(), $1::uuid, $2, $3, b.default_currency, $4::numeric / 100, now(), $5::uuid, 1
           FROM tenancy.budgets b WHERE b.id = $1::uuid`,
        [freshUser.budgetId, name, walletType, cents, freshUser.userId],
      );
    });
  },
);

Then(
  "the wallet {string} holds {int} cents",
  async ({ freshUser }, name: string, cents: number) => {
    let bal = "";
    await withBudgetGuc(freshUser.budgetId, async (client) => {
      const r = await client.query<{ b: string }>(
        `SELECT (current_balance * 100)::bigint::text AS b FROM budgeting.wallets
          WHERE tenant_id = $1::uuid AND name = $2`,
        [freshUser.budgetId, name],
      );
      bal = r.rows[0]?.b ?? "";
    });
    expect(bal).toBe(String(cents));
  },
);

When(
  "I add a {string} asset {string} of {string} units bought at {string} now {string}",
  async (
    { page },
    type: string,
    name: string,
    qty: string,
    buy: string,
    current: string,
  ) => {
    await new InvestmentsPo(page).addManual({ type, name, qty, buy, current });
  },
);

When(
  "I add {string} to the hidden {string} asset {string} of {string} units bought at {string} now {string}",
  async (
    { page },
    typed: string,
    type: string,
    _name: string,
    qty: string,
    buy: string,
    current: string,
  ) => {
    const po = new InvestmentsPo(page);
    await po.startBuy();
    await po.sheet().waitFor({ state: "visible" });
    const opt = page.getByTestId(`holding-type-${type}`);
    if (!(await opt.isVisible().catch(() => false)))
      await page.getByTestId("holding-sheet-type").click();
    await opt.click();
    const field = page.getByTestId("holding-sheet-name");
    await field.fill(typed);
    const option = page.getByTestId("asset-name-option-0");
    await expect(option).toContainText("Closed");
    await option.click();
    await expect(page.getByTestId("asset-name-note")).toBeVisible();
    await page.getByTestId("holding-sheet-buy-price").fill(buy);
    await page.getByTestId("holding-sheet-quantity").fill(qty);
    await page.getByTestId("holding-sheet-amount").fill(current);
    const posted = page.waitForResponse(
      (r) =>
        /\/budgets\/[^/]+\/investments(\?.*)?$/.test(r.url()) &&
        r.request().method() === "POST",
    );
    await page.getByTestId("holding-sheet-submit").click();
    expect(((await (await posted).json()) as { joined: boolean }).joined).toBe(
      true,
    );
  },
);

When(
  "I add {string} at {string} to the existing {string} asset {string} from the Add form",
  async ({ page }, qty: string, price: string, type: string, name: string) => {
    const po = new InvestmentsPo(page);
    await po.openAdd(type);
    await po.focusName();
    await po.pickName(name);
    // Existing pick = the locked Swap → Buy form (D-08).
    await page.getByTestId("swap-buy-qty").fill(qty);
    await page.getByTestId("swap-buy-price").fill(price);
    expect(await po.submitSwap("/buy")).toBe(201);
  },
);

When(
  "I start selling {string} leaving {string} into a new crypto asset {string} priced {string}",
  async (
    { page },
    source: string,
    left: string,
    name: string,
    price: string,
  ) => {
    await new InvestmentsPo(page).startSellIntoNewCrypto(
      source,
      left,
      name,
      price,
    );
  },
);

Then(
  "the destination price stays {string} after typing the quantity {string}",
  async ({ page }, price: string, qty: string) => {
    await new InvestmentsPo(page).expectDestPriceStaysAfterQty(qty, price);
  },
);

When("I submit the sale", async ({ page }) => {
  expect(await new InvestmentsPo(page).submitSwap("/sell")).toBe(201);
});

When(
  "I transfer all of {string} to a new asset {string} from New transaction",
  async ({ page }, name: string, to: string) => {
    const po = new InvestmentsPo(page);
    await po.startFromNewTransaction("transfer", "broker", name);
    await page.getByTestId("swap-transfer-all").click();
    await page.getByTestId("swap-transfer-name").fill(to);
    // Close the name list so it does not cover the submit button.
    await page.getByTestId("swap-transfer-name").press("Escape");
    expect(await po.submitSwap("/transfer")).toBe(201);
  },
);

When(
  "I sell {string} leaving {string} to nowhere from New transaction",
  async ({ page }, name: string, left: string) => {
    const po = new InvestmentsPo(page);
    await po.startFromNewTransaction("sell", "broker", name);
    const sheet = po.swapSheet();
    await sheet.getByTestId("swap-sell-left").fill(left);
    await sheet.getByTestId("swap-dest-out").click();
    await expect(sheet.getByTestId("swap-sell-received")).not.toHaveValue("");
    expect(await po.submitSwap("/sell")).toBe(201);
  },
);

Then(
  "there is exactly one asset row {string}",
  async ({ page }, name: string) => {
    await expect(new InvestmentsPo(page).row(name)).toHaveCount(1);
  },
);

Then(
  "the ledger of {string} has {int} entries",
  async ({ page }, name: string, n: number) => {
    const ledger = await new InvestmentsPo(page).openLedger(name);
    await expect(ledger.getByRole("row")).toHaveCount(n);
  },
);

Then(
  "the ledger of {string} lists {string}",
  async ({ page }, name: string, text: string) => {
    const ledger = await new InvestmentsPo(page).openLedger(name);
    await expect(ledger).toContainText(text);
  },
);

When(
  "I buy into broker {string} adding {string} with the account now at {string}",
  async ({ page }, name: string, amount: string, after: string) => {
    const po = new InvestmentsPo(page);
    await po.openSwap(name, "buy");
    await page.getByTestId("swap-buy-amount").fill(amount);
    await expect(page.getByTestId("swap-buy-value-after")).not.toHaveValue("");
    await page.getByTestId("swap-buy-value-after").fill(after);
    await expect(page.getByTestId("swap-buy-split")).toBeVisible();
    await expect(page.getByTestId("swap-summary")).not.toContainText(
      "Fill in the fields",
    );
    expect(await po.submitSwap("/buy")).toBe(201);
  },
);

When(
  "I buy into {string} adding {string}",
  async ({ page }, name: string, amount: string) => {
    const po = new InvestmentsPo(page);
    await po.openSwap(name, "buy");
    await page.getByTestId("swap-buy-amount").fill(amount);
    expect(await po.submitSwap("/buy")).toBe(201);
  },
);

When(
  "I sell {string} leaving {string} into the wallet {string} receiving {string}",
  async (
    { page },
    name: string,
    left: string,
    wallet: string,
    received: string,
  ) => {
    const po = new InvestmentsPo(page);
    await po.openSwap(name, "sell");
    expect(
      await po.sell({
        left,
        dest: "out",
        received,
        wallet: { kind: "existing", name: wallet },
      }),
    ).toBe(201);
  },
);

When(
  "I sell {string} leaving {string} into a new {string} wallet {string} receiving {string}",
  async (
    { page },
    name: string,
    left: string,
    type: string,
    wallet: string,
    received: string,
  ) => {
    const po = new InvestmentsPo(page);
    await po.openSwap(name, "sell");
    expect(
      await po.sell({
        left,
        dest: "out",
        received,
        wallet: { kind: "new", name: wallet, type },
      }),
    ).toBe(201);
  },
);

When(
  "I move all of {string} to a new asset {string}",
  async ({ page }, name: string, target: string) => {
    const po = new InvestmentsPo(page);
    await po.openSwap(name, "transfer");
    await page.getByTestId("swap-transfer-all").click();
    await page.getByTestId("swap-transfer-name").fill(target);
    await page.getByTestId("swap-transfer-name").press("Escape");
    expect(await po.submitSwap("/transfer")).toBe(201);
  },
);

When(
  "I delete the newest entry of {string}",
  async ({ page }, name: string) => {
    expect(await new InvestmentsPo(page).deleteNewestEntry(name)).toBe(200);
  },
);

// 13.1 UAT 12: a row that cannot go yet has a grey delete; tapping it says why.
When("I tap the oldest entry of {string}", async ({ page }, name: string) => {
  const ledger = await new InvestmentsPo(page).openLedger(name);
  const del = ledger
    .getByRole("row")
    .last()
    .locator('[data-testid^="ledger-delete-"]');
  const po = new InvestmentsPo(page);
  // A ledger refetch right after the previous write can re-render the row
  // and drop the just-opened popover — tap again until it holds.
  await expect(async () => {
    await po.revealDelete(del);
    // aria-disabled is not `disabled`: users can tap it, Playwright refuses.
    await del.click({ force: true });
    await expect(
      page.locator("[data-radix-popper-content-wrapper]"),
    ).toBeVisible({
      timeout: 2000,
    });
  }).toPass({ timeout: 20_000 });
});

When("I tap the newest entry of {string}", async ({ page }, name: string) => {
  const ledger = await new InvestmentsPo(page).openLedger(name);
  const del = ledger
    .getByRole("row")
    .first()
    .locator('[data-testid^="ledger-delete-"]');
  const po = new InvestmentsPo(page);
  // A ledger refetch right after the previous write can re-render the row
  // and drop the just-opened popover — tap again until it holds.
  await expect(async () => {
    await po.revealDelete(del);
    console.log(
      "[probe]",
      await del.evaluate((b) => {
        const r = b.getBoundingClientRect();
        const top = document.elementFromPoint(
          r.x + r.width / 2,
          r.y + r.height / 2,
        ) as HTMLElement | null;
        return JSON.stringify({
          r: [r.x, r.y, r.width, r.height],
          top: top?.outerHTML.slice(0, 160),
          op: getComputedStyle(b).opacity,
          pe: getComputedStyle(b).pointerEvents,
        });
      }),
    );
    // aria-disabled is not `disabled`: users can tap it, Playwright refuses.
    await del.click({ force: true });
    await expect(
      page.locator("[data-radix-popper-content-wrapper]"),
    ).toBeVisible({
      timeout: 2000,
    });
  }).toPass({ timeout: 20_000 });
});

Then("the ledger says {string}", async ({ page }, copy: string) => {
  await expect(page.getByText(copy)).toBeVisible();
});

When(
  "I rename {string} to {string}",
  async ({ page }, name: string, to: string) => {
    await new InvestmentsPo(page).openEdit(name);
    await page.getByTestId("edit-asset-name").fill(to);
    const res = page.waitForResponse(
      (r) =>
        /\/investments\/[0-9a-f-]+$/.test(r.url()) &&
        r.request().method() === "PATCH",
    );
    await page.getByTestId("edit-asset-save").click();
    await res;
  },
);

Then(
  "the edit says {string} and cannot be saved",
  async ({ page }, copy: string) => {
    const sheet = page.getByTestId("edit-asset-sheet");
    await expect(sheet.getByText(copy)).toBeVisible();
    await expect(sheet.getByTestId("edit-asset-save")).toBeDisabled();
  },
);

Then(
  "the {string} header shows only its value",
  async ({ page }, uiType: string) => {
    await expect(
      page.getByTestId(`investment-type-split-${uiType}`),
    ).toHaveCount(0);
    await expect(
      page.getByTestId(`investment-group-${uiType}`),
    ).not.toContainText("%");
  },
);

Then(
  "tapping the {string} header shows the P\\/L sum-up",
  async ({ page }, uiType: string) => {
    const split = await new InvestmentsPo(page).typeSumUp(uiType);
    await expect(split.locator("[data-pl-line]")).toContainText("%");
    await expect(split.locator("[data-pl-caption]")).toBeVisible();
  },
);

When(
  "I open the sale of {string} into an existing wallet",
  async ({ page }, name: string) => {
    const po = new InvestmentsPo(page);
    await po.openSwap(name, "sell");
    const sheet = po.swapSheet();
    await sheet.getByTestId("swap-sell-left").fill("30000");
    await sheet.getByTestId("swap-dest-out").click();
    await sheet.getByTestId("wallet-target-existing").click();
  },
);

Then("the Swap sheet fits the phone without overflow", async ({ page }) => {
  const sheet = page.getByTestId("swap-sheet");
  const overflow = await sheet.evaluate((el) => {
    const r = el.getBoundingClientRect();
    return [...el.querySelectorAll<HTMLElement>("*")]
      .filter((c) => {
        const b = c.getBoundingClientRect();
        return b.width > 0 && b.right > r.right + 1;
      })
      .map(
        (c) =>
          `${c.tagName}[${c.getAttribute("data-testid") ?? ""}] "${(c.textContent ?? "").slice(0, 40)}"`,
      );
  });
  expect(overflow).toEqual([]);
  const scroll = await page.evaluate(
    () => document.scrollingElement!.scrollWidth <= window.innerWidth,
  );
  expect(scroll).toBe(true);
});

Then(
  "the ledger of {string} sits on the sunken surface with an inset top shadow in both themes",
  async ({ page }, name: string) => {
    const ledger = await new InvestmentsPo(page).openLedger(name);
    for (const theme of ["dark", "light"]) {
      await page.evaluate(
        (t) => document.documentElement.setAttribute("data-theme", t),
        theme,
      );
      const look = await ledger.evaluate((el) => {
        const probe = document.createElement("div");
        probe.style.backgroundColor = "var(--surface-sunken-dark)";
        document.body.appendChild(probe);
        const token = getComputedStyle(probe).backgroundColor;
        probe.remove();
        const first = el.querySelector<HTMLElement>("[role=row]")!;
        return {
          bg: getComputedStyle(el).backgroundColor,
          token,
          shadow: getComputedStyle(first).boxShadow,
        };
      });
      expect(look.bg).toBe(look.token);
      expect(look.shadow).toContain("inset");
    }
    await page.evaluate(() =>
      document.documentElement.setAttribute("data-theme", "dark"),
    );
  },
);

Then(
  "every Swap tab of {string} shows the sum-up card once filled and fits the phone",
  async ({ page }, name: string) => {
    const po = new InvestmentsPo(page);
    await po.openSwap(name, "buy");
    for (const tab of ["buy", "sell", "transfer"] as const) {
      await page.getByTestId(`swap-tab-${tab}`).click();
      // 13.1 UAT 8: the sum-up appears only once something changes.
      await expect(page.getByTestId("swap-summary")).toHaveCount(0);
      if (tab === "buy") await page.getByTestId("swap-buy-amount").fill("100");
      else {
        if (tab === "sell") await page.getByTestId("swap-dest-out").click();
        await page.getByTestId(`swap-${tab}-all`).click();
        if (tab === "transfer") {
          await page.getByTestId("swap-transfer-name").fill("IBKR 2");
          await page.getByTestId("swap-transfer-name").press("Escape");
        }
      }
      await expect(page.getByTestId("swap-summary")).toBeVisible();
      const ok = await page.getByTestId("swap-sheet").evaluate((el) => {
        const r = el.getBoundingClientRect();
        return [...el.querySelectorAll<HTMLElement>("*")].every((c) => {
          const b = c.getBoundingClientRect();
          return b.width === 0 || b.right <= r.right + 1;
        });
      });
      expect(ok, `${tab} tab overflows`).toBe(true);
    }
    expect(
      await page.evaluate(
        () => document.scrollingElement!.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    // Leave the list reachable for the next phone check.
    await page.getByTestId("swap-transfer-name").press("Escape");
    await page.keyboard.press("Escape");
    await expect(po.swapSheet()).toHaveCount(0);
  },
);

// ── 13.1-26 ship gate: phone checks for the gap-closure surfaces ──

/** No horizontal page scroll and no untranslated key on screen. */
async function fitsAndTranslated(page: import("@playwright/test").Page) {
  expect(
    await page.evaluate(
      () => document.scrollingElement!.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await expect(page.locator("body")).not.toContainText("budget.investments.");
}

When("I switch to the {word} theme", async ({ page }, theme: string) => {
  await page.evaluate(
    (t) => document.documentElement.setAttribute("data-theme", t),
    theme,
  );
});

Then(
  "assets sit indented under their type header and tapping the {string} header shows no P\\/L",
  async ({ page }, uiType: string) => {
    const header = page.getByTestId(`investment-group-${uiType}`);
    // The row inside the padded block — padding never moves the block itself.
    const block = page
      .locator('[data-asset-block] [data-testid^="holding-row-"]')
      .first();
    const [h, b] = [
      (await header.boundingBox())!,
      (await block.boundingBox())!,
    ];
    expect(b.x).toBeGreaterThan(h.x);
    await header.click({ position: { x: h.width / 2, y: 10 } });
    await expect(
      page.locator(
        `[data-testid="investment-type-split-${uiType}"] [data-pl-line]`,
      ),
    ).toHaveCount(0);
    await fitsAndTranslated(page);
  },
);

Then(
  "the ledger of {string} slides open and a swipe on its newest row reveals a delete",
  async ({ page }, name: string) => {
    const ledger = await new InvestmentsPo(page).openLedger(name);
    await expect(
      ledger.locator("xpath=ancestor::*[@data-ledger-slide][1]"),
    ).toHaveAttribute("style", /grid-template-rows: 1fr/);
    const row = ledger.getByRole("row").first();
    const box = (await row.boundingBox())!;
    const y = box.y + box.height / 2;
    const x0 = box.x + box.width - 20;
    for (const [type, x] of [
      ["pointerdown", x0],
      ["pointermove", x0 - 40],
      ["pointermove", x0 - 100],
      ["pointerup", x0 - 100],
    ] as const)
      await row.dispatchEvent(
        type,
        {
          pointerType: "touch",
          pointerId: 11,
          clientX: x,
          clientY: y,
          bubbles: true,
        },
        { timeout: 5000 },
      );
    await expect(
      row.locator('[data-testid^="ledger-delete-"]'),
    ).toHaveAttribute("data-open", "true");
    await fitsAndTranslated(page);
  },
);

Then(
  "the New transaction chooser offers Buy, Sell and Transfer and fits the phone",
  async ({ page }) => {
    await new InvestmentsPo(page).addButton().click();
    for (const k of ["buy", "sell", "transfer"])
      await expect(page.getByTestId(`new-tx-kind-${k}`)).toBeVisible();
    await page.getByTestId("new-tx-kind-sell").click();
    await expect(page.getByTestId("new-tx-type")).toBeVisible();
    await fitsAndTranslated(page);
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("new-tx-sheet")).toHaveCount(0);
  },
);

Then(
  "a sale of {string} into a new crypto asset keeps its price {string} after typing the quantity {string}",
  async ({ page }, name: string, price: string, qty: string) => {
    const po = new InvestmentsPo(page);
    await po.startSellIntoNewCrypto(name, "0", "Phone coin", price);
    await po.expectDestPriceStaysAfterQty(qty, price);
    await expect(po.swapSheet().getByTestId("swap-dest-qty")).toHaveCount(1);
    await fitsAndTranslated(page);
    await page.keyboard.press("Escape");
    await expect(po.swapSheet()).toHaveCount(0);
  },
);

Then(
  "changing the currency of {string} to {string} in Edit shows the rate line",
  async ({ page }, name: string, ccy: string) => {
    await new InvestmentsPo(page).openEdit(name);
    const sheet = page.getByTestId("edit-asset-sheet");
    // The picker is a native <select> on touch, a Radix select elsewhere.
    const native = sheet.getByTestId("currency-picker-native");
    if (await native.isVisible().catch(() => false))
      await native.selectOption(ccy);
    else {
      await sheet.getByRole("combobox").first().click();
      await page.getByTestId(`currency-option-${ccy}`).first().click();
    }
    await expect(sheet.getByTestId("edit-asset-fx")).toBeVisible({
      timeout: 15000,
    });
    await fitsAndTranslated(page);
  },
);
