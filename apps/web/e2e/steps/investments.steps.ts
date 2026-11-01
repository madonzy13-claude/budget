import { expect, type Locator, type Page } from "@playwright/test";
import { createBdd, type DataTable } from "playwright-bdd";
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

When(
  "I add a cash asset {string} of {string} with money from {string}",
  async ({ page }, name: string, amount: string, source: string) => {
    await new InvestmentsPo(page).addCashFromAsset(name, amount, source);
  },
);

When(
  "I buy {string} of {string} at {string} with money from {string}",
  async (
    { page },
    qty: string,
    name: string,
    price: string,
    source: string,
  ) => {
    await new InvestmentsPo(page).buyFromAsset(name, qty, price, source);
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

// R6-7: the header row itself opens / closes its group.
When("I collapse the {string} type block", async ({ page }, uiType: string) => {
  await page.getByTestId(`investment-group-${uiType}`).click();
});

Then(
  "the {string} type block is collapsed",
  async ({ page }, uiType: string) => {
    await expect(
      page.getByTestId(`investment-group-${uiType}`),
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
      scope.locator('[style*="--amt"]').first().boundingBox();
    const rows = new InvestmentsPo(page);
    const a = await box(rows.row("Flat A"));
    const b = await box(rows.row("Flat B"));
    expect(a && b).toBeTruthy();
    // Rows line up with each other…
    expect(Math.abs(a!.x - b!.x)).toBeLessThan(1);
    // …on their own width, not the block total's (R6-7: an open header has
    // no fixed column, so compare the rows' column to the total's length).
    const total = (
      await page
        .getByTestId(`investment-type-value-${uiType}`)
        .locator(".num")
        .locator("visible=true")
        .last()
        .innerText()
    ).trim();
    const col = await rows
      .row("Flat A")
      .locator('[style*="--amt"]')
      .first()
      .evaluate((el) =>
        parseFloat((el as HTMLElement).style.getPropertyValue("--amt")),
      );
    expect(col).toBeLessThan(total.length + 1);
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
    // Round 2: the caption is unrealized · realized amounts, no words.
    await expect(
      split.locator("[data-pl-caption] [data-signed]").nth(1),
    ).toContainText(amount);
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

When(
  "I sell {string} leaving {string} into {string} receiving {string} in {string}",
  async (
    { page },
    name: string,
    left: string,
    target: string,
    received: string,
    ccy: string,
  ) => {
    const po = new InvestmentsPo(page);
    await po.openSwap(name, "sell");
    expect(
      await po.sell({
        left,
        dest: "existing",
        existingName: target,
        received,
        currency: ccy,
      }),
    ).toBe(201);
  },
);

Then(
  "there is exactly one asset named {string}",
  async ({ page }, name: string) => {
    await expect(new InvestmentsPo(page).row(name)).toHaveCount(1);
  },
);

When("I open the sale of {string}", async ({ page }, name: string) => {
  await new InvestmentsPo(page).openSwap(name, "sell");
});

When(
  "I set {string} in the sale to {string}",
  async ({ page }, field: string, v: string) => {
    const sheet = page.getByTestId("swap-sheet");
    if (field === "Value left")
      return new InvestmentsPo(page).fillSoldFromLeft(sheet, v);
    const id =
      field === "Value sold"
        ? "swap-sell-sold"
        : field === "Amount moved"
          ? "swap-transfer-qty"
          : "swap-sell-received";
    await sheet.getByTestId(id).fill(v);
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
    await expect(
      split.locator("[data-pl-caption] [data-signed]").nth(1),
    ).toHaveText("0");
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

When(
  "I add a deposit {string} of {string} at {string}% started on {string}",
  async ({ page }, name: string, p: string, rate: string, start: string) => {
    await new InvestmentsPo(page).addDeposit(name, p, rate, start);
  },
);

// Round 5: held unit, over-held transfer, assets start closed.
When("I open Swap → Transfer on {string}", async ({ page }, name: string) => {
  await new InvestmentsPo(page).openSwap(name, "transfer");
});

Then("the Transfer helper reads {string}", async ({ page }, text: string) => {
  await expect(page.getByTestId("swap-transfer-held")).toHaveText(text);
});

When("I type {string} as the Transfer amount", async ({ page }, v: string) => {
  await page.getByTestId("swap-transfer-qty").fill(v);
});

Then("the Swap sheet says {string}", async ({ page }, text: string) => {
  await expect(page.getByTestId("swap-sheet").getByText(text)).toBeVisible();
});

When("I open the ledger of {string}", async ({ page }, name: string) => {
  await new InvestmentsPo(page).openLedger(name);
});

Then("the asset {string} is closed", async ({ page }, name: string) => {
  await expect(
    new InvestmentsPo(page).row(name).locator('[data-testid^="asset-row-"]'),
  ).toHaveAttribute("aria-expanded", "false");
});

When("I tap the asset row {string}", async ({ page }, name: string) => {
  const po = new InvestmentsPo(page);
  await page.getByTestId(`asset-row-${await po.assetId(name)}`).click();
});

// Round 5 gap 12: the fade follows the scroll — never over the text at rest.
Then(
  "its scrolling caption is sharp on the left at the start and on the right at the end",
  async ({ page }) => {
    const line = page.locator(".fit-line-fade:visible").first();
    await expect(line).toBeVisible();
    const at = (pct: number) =>
      line.evaluate((el, p) => {
        const anims = [el, el.firstElementChild!].flatMap((n) =>
          (n as HTMLElement).getAnimations(),
        );
        for (const a of anims) {
          a.pause();
          a.currentTime = 8000 * p;
        }
        const cs = getComputedStyle(el);
        return {
          left: cs.getPropertyValue("--fit-fl").trim(),
          right: cs.getPropertyValue("--fit-fr").trim(),
        };
      }, pct);
    expect(await at(0.1)).toEqual({ left: "0px", right: "10px" });
    expect(await at(0.6)).toEqual({ left: "10px", right: "0px" });
  },
);

/** The picked asset's Buy form (Add → existing asset): quantity × price for
 *  a quantity asset, otherwise the amount (a broker's value after follows). */
async function buyInPickedForm(page: Page, qty: string, price: string) {
  const qtyField = page.getByTestId("swap-buy-qty");
  await expect(
    qtyField.or(page.getByTestId("swap-buy-amount")).first(),
  ).toBeVisible({ timeout: 15000 });
  if (await qtyField.isVisible().catch(() => false)) {
    await qtyField.fill(qty);
    await page.getByTestId("swap-buy-price").fill(price);
  } else
    await page
      .getByTestId("swap-buy-amount")
      .fill(String(Number(qty) * Number(price)));
  expect(await new InvestmentsPo(page).submitSwap("/buy")).toBe(201);
}

When(
  "I type {string} as the name in the {string} Add form",
  async ({ page }, name: string, type: string) => {
    const po = new InvestmentsPo(page);
    await po.openAdd(type);
    await po.sheet().getByTestId("holding-sheet-name").fill(name);
  },
);

Then(
  "the name list offers {string} and {int} {string} options with {string} and {string}",
  async (
    { page },
    _create: string,
    n: number,
    name: string,
    a: string,
    b: string,
  ) => {
    const list = page.getByRole("listbox");
    await expect(page.getByTestId("asset-name-create")).toBeVisible();
    const opts = list
      .getByRole("option")
      .filter({ hasText: new RegExp(`^${name}`) });
    await expect(opts).toHaveCount(n);
    await expect(opts.filter({ hasText: a })).toHaveCount(1);
    await expect(opts.filter({ hasText: b })).toHaveCount(1);
  },
);

When(
  "I pick the {string} option worth {string}",
  async ({ page }, name: string, worth: string) => {
    await page
      .getByRole("option")
      .filter({ hasText: new RegExp(`^${name}`) })
      .filter({ hasText: worth })
      .dispatchEvent("mousedown");
  },
);

Then("the picked asset line reads {string}", async ({ page }, text: string) => {
  await expect(page.getByTestId("asset-name-picked")).toHaveText(text);
});

// Round-6 gap 2: the deal's own figure.
When(
  "I sell everything of {string} out of investments in {string} at the suggested amount",
  async ({ page }, name: string, ccy: string) => {
    const po = new InvestmentsPo(page);
    await po.openSwap(name, "sell");
    const sheet = po.swapSheet();
    await po.fillSoldFromLeft(sheet, "0");
    await sheet.getByTestId("swap-dest-out").click();
    const row = sheet.getByTestId("swap-received-row");
    const native = row.getByTestId("currency-picker-native");
    if (await native.isVisible().catch(() => false))
      await native.selectOption(ccy);
    else {
      await row.getByRole("combobox").click();
      await page.getByTestId(`currency-option-${ccy}`).first().click();
    }
    await expect(sheet.getByTestId("swap-sell-received")).not.toHaveValue("");
    expect(await po.submitSwap("/sell")).toBe(201);
  },
);

Then(
  "the newest ledger row of {string} reads in {string} and leaves {string} in the asset's currency",
  async ({ page }, name: string, dealCcy: string, after: string) => {
    const ledger = await new InvestmentsPo(page).openLedger(name);
    const row = ledger.getByRole("row").first();
    await expect(row).toContainText(dealCcy);
    await expect(row.locator("[data-after]")).toHaveText(
      new RegExp(`^= ${after} [A-Z]{3}$`),
    );
  },
);

When(
  "I show the asset {string} in {string}",
  async ({ page }, name: string, ccy: string) => {
    await new InvestmentsPo(page).pickAssetCurrency(name, ccy);
  },
);

Then(
  "the newest ledger row of {string} leaves a total in {string}, not {string}",
  async ({ page }, name: string, ccy: string, own: string) => {
    const ledger = await new InvestmentsPo(page).openLedger(name);
    const after = ledger.getByRole("row").first().locator("[data-after]");
    await expect(after).toHaveText(new RegExp(`^= [^ ]+ ${ccy}$`), {
      timeout: 15000,
    });
    await expect(after).not.toHaveText(new RegExp(`^= ${own} `));
  },
);

// Round-6 gap 1: collectibles by units.
Then(
  "selling {string} asks how many units, holding {string}",
  async ({ page }, name: string, held: string) => {
    const po = new InvestmentsPo(page);
    await po.openSwap(name, "sell");
    const sheet = po.swapSheet();
    await expect(sheet.getByTestId("swap-sell-held")).toHaveText(held);
    await expect(sheet.getByText("Quantity sold")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(sheet).toHaveCount(0);
  },
);

Then("moving {string} asks how many units", async ({ page }, name: string) => {
  const po = new InvestmentsPo(page);
  await po.openSwap(name, "transfer");
  await expect(po.swapSheet().getByTestId("swap-transfer-held")).toHaveText(
    /^You hold 2$/,
  );
});

// Round-6 gaps 4 + 6: the asset row.
Then(
  "the asset {string} shows {string} above its price",
  async ({ page }, name: string, text: string) => {
    const row = new InvestmentsPo(page).row(name);
    const line = row.getByTestId(/^investment-row-qtyavg$/);
    await expect(line.first()).toHaveText(text);
    await expect(line.first().locator("svg")).toHaveCount(0);
  },
);

Then(
  "the asset {string} caption shows unrealized and realized",
  async ({ page }, name: string) => {
    const caption = new InvestmentsPo(page)
      .row(name)
      .locator("[data-asset-caption]");
    await expect(caption).toHaveText(/unreal\.: .+real\.: /);
  },
);

Then(
  "the asset {string} offers Edit first and + second",
  async ({ page }, name: string) => {
    const id = await new InvestmentsPo(page).assetId(name);
    const order = await page.evaluate((hid) => {
      const ids = [...document.querySelectorAll("[data-testid]")]
        .map((el) => el.getAttribute("data-testid")!)
        .filter(
          (t) =>
            t === `investment-edit-desktop-${hid}` ||
            t === `investment-swap-desktop-${hid}` ||
            t === `holding-swipe-edit-${hid}` ||
            t === `investment-swap-${hid}`,
        );
      return ids;
    }, id);
    expect(order.length).toBeGreaterThanOrEqual(2);
    expect(order[0]).toMatch(/edit/);
    expect(order[1]).toMatch(/swap/);
  },
);

// Round 6: a currency change in Edit saves (never the offline toast).
When(
  "I change the currency of {string} to {string} in Edit and save",
  async ({ page }, name: string, ccy: string) => {
    await new InvestmentsPo(page).openEdit(name);
    const sheet = page.getByTestId("edit-asset-sheet");
    const native = sheet.getByTestId("currency-picker-native");
    if (await native.isVisible().catch(() => false))
      await native.selectOption(ccy);
    else {
      await sheet.getByRole("combobox").first().click();
      await page.getByTestId(`currency-option-${ccy}`).first().click();
    }
    const res = page.waitForResponse(
      (r) =>
        /\/investments\/[0-9a-f-]+$/.test(r.url()) &&
        r.request().method() === "PATCH",
      { timeout: 15000 },
    );
    await sheet.getByTestId("edit-asset-save").click();
    expect((await res).status()).toBe(200);
    await expect(page.getByText("You're offline")).toHaveCount(0);
  },
);

When("I open Edit for {string}", async ({ page }, name: string) => {
  await new InvestmentsPo(page).openEdit(name);
});

Then(
  "the locked price follows the currency through {string}, {string}, {string} and back",
  async ({ page }, a: string, b: string, c: string) => {
    const sheet = page.getByTestId("edit-asset-sheet");
    const locked = sheet.getByTestId("edit-asset-locked-currentPrice");
    const start = await locked.inputValue();
    const native0 = sheet.getByTestId("currency-picker-native");
    const ccy0 = (await native0.isVisible().catch(() => false))
      ? await native0.inputValue()
      : (await sheet.getByRole("combobox").first().innerText()).trim();
    const pick = async (ccy: string) => {
      const native = sheet.getByTestId("currency-picker-native");
      if (await native.isVisible().catch(() => false))
        await native.selectOption(ccy);
      else
        // Radix may swallow a trigger click right after it closed: retry.
        await expect(async () => {
          await sheet.getByRole("combobox").first().click();
          await page
            .getByTestId(`currency-option-${ccy}`)
            .first()
            .click({ timeout: 1500 });
        }).toPass({ timeout: 10000 });
    };
    const seen: string[] = [];
    for (const ccy of [a, b, c]) {
      await pick(ccy);
      // Shown at once — no wait on a fresh network round trip per pick.
      await expect(locked).not.toHaveValue(start, { timeout: 1500 });
      if (seen.length) await expect(locked).not.toHaveValue(seen.at(-1)!);
      seen.push(await locked.inputValue());
    }
    expect(seen[0]).toBe(seen[2]);
    await pick(ccy0);
    await expect(locked).toHaveValue(start, { timeout: 1500 });
  },
);

Then(
  "the asset {string} is shown in {string}",
  async ({ page }, name: string, ccy: string) => {
    await expect(new InvestmentsPo(page).row(name)).toContainText(ccy);
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
    await expect(option).toContainText("Hidden");
    // Round 5: names never join — picking the archived asset restores it
    // (by id) and opens its Buy form.
    const restored = page.waitForResponse(
      (r) => r.url().endsWith("/restore") && r.request().method() === "POST",
      { timeout: 15000 },
    );
    await option.click();
    expect((await restored).ok()).toBe(true);
    void current;
    await buyInPickedForm(page, qty, buy);
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
    await page.getByTestId("swap-transfer-held").click();
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
    const sheet = po.txForm();
    await po.fillSoldFromLeft(sheet, left);
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
    await page.getByTestId("swap-transfer-held").click();
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
  "the {string} header shows only its value",
  async ({ page }, uiType: string) => {
    await expect(
      page.getByTestId(`investment-type-split-${uiType}`),
    ).toHaveCount(0);
    // A phone closes to the value alone; desktop always shows its columns
    // (R6, user), so only the phone's stacked sum-up is checked there.
    if ((page.viewportSize()?.width ?? 1280) < 640)
      expect(
        await page.getByTestId(`investment-group-${uiType}`).innerText(),
      ).not.toContain("%");
  },
);

Then(
  "the {string} header shows the P\\/L sum-up and a guide line beside its assets",
  async ({ page }, uiType: string) => {
    const split = await new InvestmentsPo(page).typeSumUp(uiType);
    await expect(
      split.locator("[data-pl-caption]").locator("visible=true"),
    ).toBeVisible();
    await expect(
      page.getByTestId(`investment-group-guide-${uiType}`),
    ).toBeVisible();
  },
);

Then(
  "tapping the {string} header shows the P\\/L sum-up",
  async ({ page }, uiType: string) => {
    const split = await new InvestmentsPo(page).typeSumUp(uiType);
    await expect(
      split.locator("[data-pl-line]").locator("visible=true"),
    ).toContainText("%");
    await expect(
      split.locator("[data-pl-caption]").locator("visible=true"),
    ).toBeVisible();
  },
);

When(
  "I open the sale of {string} into an existing wallet",
  async ({ page }, name: string) => {
    const po = new InvestmentsPo(page);
    await po.openSwap(name, "sell");
    const sheet = po.swapSheet();
    await po.fillSoldFromLeft(sheet, "30000");
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

// Round-2 gaps 4/11: shadow + background on the SAME painted element (the old
// check passed while the shadow sat under an opaque child), clearly darker
// than the asset card, every amount in the strip's muted grey.
Then(
  "the ledger of {string} is darker than its asset and casts the inset top shadow in both themes",
  async ({ page }, name: string) => {
    const po = new InvestmentsPo(page);
    await po.openLedger(name);
    const id = await po.assetId(name);
    for (const theme of ["dark", "light"]) {
      await page.evaluate(
        (t) => document.documentElement.setAttribute("data-theme", t),
        theme,
      );
      // The asset card has transition-colors: read it once it has settled.
      await page.evaluate(() =>
        Promise.all(
          document
            .getAnimations()
            .filter((a) => a instanceof CSSTransition)
            // A cancelled transition rejects — that is settled too.
            .map((a) => a.finished.catch(() => undefined)),
        ),
      );
      const look = await page.evaluate(
        ({ id, name }) => {
          const probe = document.createElement("div");
          probe.style.backgroundColor = "var(--surface-ledger-dark)";
          document.body.appendChild(probe);
          const token = getComputedStyle(probe).backgroundColor;
          probe.remove();
          const strip = document.querySelector(
            `[data-testid="asset-ledger-${id}"]`,
          )!;
          const surface = strip.querySelector("[data-ledger-surface]");
          const card = document.querySelector(
            `[data-testid="holding-row-${name}"]`,
          )!;
          const amounts = [
            ...strip.querySelectorAll(
              '[role=row]:not([data-testid^="ledger-row-interest-"]) .num span',
            ),
          ]
            .filter((s) => /\s[A-Z]{3}$/.test((s.textContent ?? "").trim()))
            .map((s) => getComputedStyle(s).color);
          return {
            token,
            bg: surface && getComputedStyle(surface).backgroundColor,
            shadow: surface && getComputedStyle(surface).boxShadow,
            card: getComputedStyle(card).backgroundColor,
            muted: getComputedStyle(strip).color,
            amounts,
          };
        },
        { id, name },
      );
      // Gamma-encoded luma on 0–1 sRGB channels (no linearisation).
      const luma = (c: string) => {
        const [r, g, b] = (c.match(/[\d.]+/g) ?? []).map(Number);
        return (0.299 * r! + 0.587 * g! + 0.114 * b!) / 255;
      };
      expect(look.bg, `${theme}: no [data-ledger-surface]`).not.toBeNull();
      expect(look.token).not.toBe("rgba(0, 0, 0, 0)");
      expect(look.bg).toBe(look.token);
      expect(look.shadow).toContain("inset");
      expect(
        luma(look.card) - luma(look.bg!),
        `${theme}: ledger ${look.bg} vs card ${look.card}`,
      ).toBeGreaterThanOrEqual(0.01);
      expect(look.amounts.length).toBeGreaterThan(0);
      for (const c of look.amounts) expect(c).toBe(look.muted);
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
        await page.getByTestId(`swap-${tab}-held`).click();
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
    await openGroup(page, uiType);
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

// ── 13.1 round 2 (gaps 1–13) ──

Given(
  "a deposit {string} of {int} cents at {int}% yearly started {int} months ago exists in my budget",
  async (
    { freshUser },
    name: string,
    principal: number,
    pct: number,
    months: number,
  ) => {
    await withBudgetGuc(freshUser.budgetId, async (client) => {
      await client.query(
        `INSERT INTO budgeting.investments
           (id, tenant_id, budget_id, name, holding_type, ui_type, quantity,
            buy_price_cents, buy_currency, current_price_currency,
            deposit_rate_bps, deposit_start_date, deposit_cap_frequency,
            sort_order, created_at)
         VALUES (gen_random_uuid(), $1::uuid, $1::uuid, $2, 'deposit', 'deposit', '1',
                 $3::bigint, 'USD', 'USD', $4::int,
                 (current_date - ($5::int * interval '1 month'))::date, 'yearly', 0, now())`,
        [freshUser.budgetId, name, principal, pct * 100, months],
      );
      await addStart(client, freshUser.budgetId, name);
    });
  },
);

// A linked transfer pair written straight to the ledger (no Swap UI), so the
// ledger-look scenarios do not depend on the Sell/Transfer forms.
Given(
  "{string} moved {int} cents to {string} on its ledger",
  async ({ freshUser }, from: string, cents: number, to: string) => {
    await withBudgetGuc(freshUser.budgetId, async (client) => {
      await client.query(
        `WITH a AS (SELECT id, tenant_id, budget_id, coalesce(buy_currency, 'USD') AS ccy
                      FROM budgeting.investments WHERE budget_id = $1::uuid AND name = $2),
              b AS (SELECT id FROM budgeting.investments WHERE budget_id = $1::uuid AND name = $4),
              t AS (SELECT gen_random_uuid() AS tid)
         INSERT INTO budgeting.investment_history
           (tenant_id, budget_id, holding_id, kind, effective_date, amount_cents,
            amount_currency, cost_delta_cents, cost_currency, transfer_id)
         SELECT a.tenant_id, a.budget_id, a.id, 'transfer_out', current_date - 1,
                $3::bigint, a.ccy, -$3::bigint, a.ccy, t.tid FROM a, t
         UNION ALL
         SELECT a.tenant_id, a.budget_id, b.id, 'transfer_in', current_date - 1,
                $3::bigint, a.ccy, $3::bigint, a.ccy, t.tid FROM a, b, t`,
        [freshUser.budgetId, from, cents, to],
      );
    });
  },
);

Given(
  "a tracked crypto asset {string} on {string} of {string} units at {int} cents exists in my budget",
  async (
    { freshUser },
    name: string,
    symbol: string,
    qty: string,
    price: number,
  ) => {
    await withBudgetGuc(freshUser.budgetId, async (client) => {
      await client.query(
        `INSERT INTO budgeting.investments
           (id, tenant_id, budget_id, instrument_id, name, holding_type, ui_type, quantity,
            buy_price_cents, buy_currency, current_price_cents, current_price_currency,
            sort_order, created_at)
         SELECT gen_random_uuid(), $1::uuid, $1::uuid,
                (SELECT id FROM budgeting.instruments WHERE provider = 'coingecko' AND symbol = $3 LIMIT 1),
                $2, 'crypto', 'crypto', $4::numeric, $5::bigint, b.default_currency,
                $5::numeric, b.default_currency, 0, now()
           FROM tenancy.budgets b WHERE b.id = $1::uuid`,
        [freshUser.budgetId, name, symbol, qty, price],
      );
      await addStart(client, freshUser.budgetId, name);
    });
  },
);

Given(
  "a silver coin asset {string} of {int} grams at {int} cents with premium {string} exists in my budget",
  async (
    { freshUser },
    name: string,
    grams: number,
    price: number,
    premium: string,
  ) => {
    await withBudgetGuc(freshUser.budgetId, async (client) => {
      await client.query(
        `INSERT INTO budgeting.investments
           (id, tenant_id, budget_id, instrument_id, name, holding_type, ui_type,
            metal, metal_kind, unit_of_measure, premium_pct, quantity,
            buy_price_cents, buy_currency, current_price_cents, current_price_currency,
            sort_order, created_at)
         SELECT gen_random_uuid(), $1::uuid, $1::uuid,
                (SELECT id FROM budgeting.instruments WHERE provider = 'gold_api' AND symbol = 'XAG/USD' LIMIT 1),
                $2, 'commodity', 'precious_metals', 'silver', 'coin', 'g', $5::numeric,
                $3::numeric, $4::bigint, b.default_currency, $4::numeric, b.default_currency, 0, now()
           FROM tenancy.budgets b WHERE b.id = $1::uuid`,
        [freshUser.budgetId, name, grams, price, premium],
      );
      await addStart(client, freshUser.budgetId, name);
    });
  },
);

// Gap 1: interest accrued so far, dated today, never deletable (D-19).
Then(
  "the ledger of {string} shows an Interest row dated today that cannot be deleted",
  async ({ page }, name: string) => {
    const ledger = await new InvestmentsPo(page).openLedger(name);
    const local = new Date().toLocaleDateString("en-CA");
    const utc = new Date().toISOString().slice(0, 10);
    const row = ledger
      .locator(
        `[data-testid="ledger-row-interest-${local}"], [data-testid="ledger-row-interest-${utc}"]`,
      )
      .first();
    await expect(row).toBeVisible({ timeout: 10000 });
    await expect(row).toContainText("Interest");
    await expect(
      row.locator('[data-testid^="ledger-delete-"]'),
    ).toHaveAttribute("aria-disabled", "true");
  },
);

// Gap 2: the type header is an asset-row-shaped card.
Then(
  "the {string} header lines up with the asset row {string}",
  async ({ page }, uiType: string, name: string) => {
    const header = page.getByTestId(`investment-group-${uiType}`);
    const row = new InvestmentsPo(page).row(name);
    const label = uiType[0]!.toUpperCase() + uiType.slice(1);
    const [h, r, hg, rg, hn, rn] = await Promise.all([
      header.boundingBox(),
      row.boundingBox(),
      page.getByTestId(`drag-grip-type ${uiType}`).boundingBox(),
      page.getByTestId(`drag-grip-${name.toLowerCase()}`).boundingBox(),
      header
        .getByText(label, { exact: true })
        .locator("visible=true")
        .boundingBox(),
      row
        .getByText(name, { exact: true })
        .locator("visible=true")
        .boundingBox(),
    ]);
    expect(Math.abs(h!.height - r!.height), "card height").toBeLessThanOrEqual(
      1,
    );
    expect(
      Math.abs(hg!.x - h!.x - (rg!.x - r!.x)),
      "drag handle offset",
    ).toBeLessThanOrEqual(1);
    // Round 4 moved the type icon onto the header, so the names no longer
    // share an x-offset (hn / rn kept for the log); handle + height still do.
    void hn;
    void rn;
  },
);

/** Header tap mirrors the asset reveal: grows, P/L line, two bare amounts,
 *  share under the value. */
/** R6-7: the header row toggles its group; open it if it is closed. */
async function openGroup(page: Page, uiType: string) {
  const header = page.getByTestId(`investment-group-${uiType}`);
  if ((await header.getAttribute("aria-expanded")) !== "true")
    await header.click();
  await expect(header).toHaveAttribute("aria-expanded", "true");
}

async function expectHeaderReveal(
  page: import("@playwright/test").Page,
  uiType: string,
) {
  const header = page.getByTestId(`investment-group-${uiType}`);
  const split = page.getByTestId(`investment-type-split-${uiType}`);
  // R6-7: groups start open (stats shown) — close first, then reopen.
  if (await split.isVisible().catch(() => false)) {
    await header.click();
    await expect(split).toHaveCount(0);
  }
  const h0 = (await header.boundingBox())!.height;
  await header.click();
  await expect(split).toBeVisible();
  // Round 3: the reveal fits the card like the asset row (no grow).
  expect(
    Math.abs((await header.boundingBox())!.height - h0),
  ).toBeLessThanOrEqual(1);
  await expect(split.locator("[data-pl-line]")).toContainText("%");
  const caption = split.locator("[data-pl-caption]");
  await expect(caption.locator("[data-signed]")).toHaveCount(2);
  const [v, s] = await Promise.all([
    page.getByTestId(`investment-type-value-${uiType}`).boundingBox(),
    page.getByTestId(`investment-type-share-${uiType}`).boundingBox(),
  ]);
  expect(v && s, "value + share rendered").toBeTruthy();
  expect(s!.y).toBeGreaterThanOrEqual(v!.y + v!.height - 1);
  expect(Math.abs(s!.x + s!.width - (v!.x + v!.width))).toBeLessThanOrEqual(2);
}

Then(
  "tapping the {string} header mirrors the asset reveal",
  async ({ page }, uiType: string) => {
    await expectHeaderReveal(page, uiType);
  },
);

Then(
  "tapping the {string} header shows the share under its value",
  async ({ page }, uiType: string) => {
    await expectHeaderReveal(page, uiType);
    await fitsAndTranslated(page);
  },
);

// Gap 3: the asset's share sits under its amount, not in the caption.
Then(
  "tapping the asset row {string} shows its share under the amount {string}",
  async ({ page }, name: string, amount: string) => {
    const po = new InvestmentsPo(page);
    const id = await po.assetId(name);
    await page.getByTestId(`asset-row-${id}`).click();
    const share = page.getByTestId(`asset-share-${id}`);
    await expect(share).toBeVisible();
    const [a, s] = await Promise.all([
      po
        .row(name)
        .getByText(amount, { exact: true })
        .locator("visible=true")
        .boundingBox(),
      share.boundingBox(),
    ]);
    expect(s!.y).toBeGreaterThanOrEqual(a!.y + a!.height - 1);
    expect(Math.abs(s!.x + s!.width - (a!.x + a!.width))).toBeLessThanOrEqual(
      2,
    );
  },
);

// Gap 12: "to X" / "from X" is a step smaller than the date · kind line.
Then(
  "the linked line in the ledger of {string} is smaller than its date line",
  async ({ page }, name: string) => {
    const ledger = await new InvestmentsPo(page).openLedger(name);
    const size = (l: Locator) =>
      l.first().evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    const linked = await size(ledger.getByText(/^(to|from) /));
    const dated = await size(ledger.getByText(/· Transfer (out|in)$/));
    expect(linked).toBeLessThan(dated);
  },
);

// Gap 5: the open ledger follows its swiped row and nothing is clipped.
When(
  "I swipe the asset {string} with its ledger open",
  async ({ page }, name: string) => {
    const po = new InvestmentsPo(page);
    await po.openLedger(name);
    await po.swipeAsset(name, 220);
  },
);

Then(
  "the ledger of {string} moves with its row and nothing is clipped",
  async ({ page }, name: string) => {
    const id = await new InvestmentsPo(page).assetId(name);
    const m = await page.evaluate((id) => {
      const wrap = document.querySelector(
        `[data-investment-row-wrapper="${id}"]`,
      )!;
      const card = wrap.lastElementChild!;
      const strip = document.querySelector(
        `[data-testid="asset-ledger-${id}"]`,
      )!;
      const first = strip.querySelector("[role=row]")!;
      const rc = card.getBoundingClientRect();
      const sc = strip.getBoundingClientRect();
      const fr = first.getBoundingClientRect();
      const rowY = rc.top + rc.height / 2;
      const ledY = fr.top + fr.height / 2;
      const clipped: number[] = [];
      for (let x = 0; x < innerWidth; x += 4) {
        const inRow = card.contains(document.elementFromPoint(x, rowY));
        const inStrip = strip.contains(document.elementFromPoint(x, ledY));
        if (inRow && !inStrip) clipped.push(x);
      }
      const clippers: string[] = [];
      for (
        let n = strip.parentElement;
        n && !n.hasAttribute("data-asset-block");
        n = n.parentElement
      )
        if (/hidden|clip/.test(getComputedStyle(n).overflowX))
          clippers.push(`${n.tagName}.${n.className}`.slice(0, 80));
      return {
        rowLeft: rc.left,
        stripLeft: sc.left,
        clipped: clipped.length,
        clippedFrom: clipped[0],
        clippedTo: clipped.at(-1),
        clippers,
      };
    }, id);
    console.log("[r2-swipe]", JSON.stringify(m));
    expect(m.rowLeft, "row did not swipe").toBeLessThan(0);
    expect(Math.abs(m.rowLeft - m.stripLeft)).toBeLessThanOrEqual(1);
    expect(m.clipped, `clipped x ${m.clippedFrom}..${m.clippedTo}`).toBe(0);
  },
);

// Gap 6: New transaction opens on Buy with the Add form inside.
async function expectNewTxOnBuy(page: import("@playwright/test").Page) {
  await new InvestmentsPo(page).addButton().click();
  const sheet = page.getByTestId("new-tx-sheet");
  await expect(page.getByTestId("new-tx-kind-buy")).toHaveAttribute(
    "aria-checked",
    "true",
  );
  await expect(sheet.getByTestId("holding-sheet")).toBeVisible();
  for (const k of ["buy", "sell", "transfer"])
    await expect(page.getByTestId(`new-tx-kind-${k}`)).toBeVisible();
}

Then(
  "New transaction opens on Buy with the Add form inside and every kind visible",
  async ({ page }) => {
    await expectNewTxOnBuy(page);
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("new-tx-sheet")).toHaveCount(0);
  },
);

Then(
  "the New transaction sheet opens on Buy with the switch visible",
  async ({ page }) => {
    await expectNewTxOnBuy(page);
    await fitsAndTranslated(page);
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("new-tx-sheet")).toHaveCount(0);
  },
);

Then(
  "picking Sell in New transaction asks for the type and drops the Add form",
  async ({ page }) => {
    await new InvestmentsPo(page).addButton().click();
    await page.getByTestId("new-tx-kind-sell").click();
    await expect(page.getByTestId("new-tx-type")).toBeVisible();
    await expect(page.getByTestId("holding-sheet")).toHaveCount(0);
  },
);

// Gap 10: Edit shows the asset's configuration, locked.
Then(
  "Edit of {string} shows these locked fields",
  async ({ page }, name: string, table: DataTable) => {
    await new InvestmentsPo(page).openEdit(name);
    const sheet = page.getByTestId("edit-asset-sheet");
    for (const { field, value } of table.hashes()) {
      const el = sheet.getByTestId(`edit-asset-locked-${field}`);
      await expect(el, field).toBeVisible();
      const got = await el.evaluate((n) => ({
        text:
          n instanceof HTMLInputElement
            ? n.value
            : (n.textContent ?? "").trim(),
        locked:
          (n as HTMLInputElement).readOnly ||
          n.getAttribute("aria-readonly") === "true",
      }));
      expect(got.locked, `${field} locked`).toBe(true);
      if (value === "*") expect(got.text, field).not.toBe("");
      else expect(got.text, field).toContain(value);
    }
    await expect(sheet).not.toContainText("budget.investments.");
    await page.keyboard.press("Escape");
    await expect(sheet).toHaveCount(0);
  },
);

// Gap 13: every quantity entry reads "±qty × price".
When(
  "I move {string} of the {string} asset {string} to a new asset {string} from New transaction",
  async ({ page }, qty: string, type: string, name: string, to: string) => {
    const po = new InvestmentsPo(page);
    await po.startFromNewTransaction("transfer", type, name);
    await page.getByTestId("swap-transfer-qty").fill(qty);
    await page.getByTestId("swap-transfer-name").fill(to);
    await page.getByTestId("swap-transfer-name").press("Escape");
    expect(await po.submitSwap("/transfer")).toBe(201);
  },
);

Then(
  "every quantity entry in the ledger of {string} reads quantity at price",
  async ({ page }, name: string) => {
    const ledger = await new InvestmentsPo(page).openLedger(name);
    const lines = await ledger
      .locator("[role=row]")
      .evaluateAll((rows) =>
        rows.map(
          (r) =>
            [...r.querySelectorAll(".num span")]
              .map((s) => (s.textContent ?? "").trim())
              .find((t) => /^[+−-]?\d/.test(t) && !/[A-Z]{3}$/.test(t)) ?? null,
        ),
      );
    expect(lines.length).toBeGreaterThan(0);
    for (const l of lines) expect(l).toMatch(/^[+−-][\d.,\s]+ × [\d.,\s]+$/);
  },
);

// Gaps 7–9: Sell asks what was sold; Sell / Move everything stay editable.
Then("the sale asks {string}", async ({ page }, copy: string) => {
  await expect(
    page
      .getByTestId("swap-sheet")
      .getByRole("heading", { name: copy, exact: true }),
  ).toBeVisible();
});

When("I tap {string} in the sale", async ({ page }, testId: string) => {
  await page.getByTestId("swap-sheet").getByTestId(testId).click();
});

Then(
  "{string} holds {string} and stays editable",
  async ({ page }, testId: string, value: string) => {
    const field = page.getByTestId("swap-sheet").getByTestId(testId);
    await expect(field).toHaveValue(value);
    await expect(field).not.toHaveAttribute("readonly");
  },
);

When(
  "I send the sale out of investments receiving {string}",
  async ({ page }, received: string) => {
    const po = new InvestmentsPo(page);
    const sheet = po.swapSheet();
    await sheet.getByTestId("swap-dest-out").click();
    await sheet.getByTestId("swap-sell-received").fill(received);
    expect(await po.submitSwap("/sell")).toBe(201);
  },
);

When("I open the transfer of {string}", async ({ page }, name: string) => {
  await new InvestmentsPo(page).openSwap(name, "transfer");
});

/** A Radix list (in the DOM, collision-aware) of normal height: ≥120px, or
 *  every option fully inside both the list and the viewport. */
async function expectFullList(
  page: import("@playwright/test").Page,
  trigger: Locator,
  name: string,
  option?: Locator,
) {
  const t = (await trigger.boundingBox())!;
  console.log(
    "[r2-picker]",
    await trigger.getAttribute("data-testid"),
    "trigger bottom → viewport bottom:",
    Math.round(page.viewportSize()!.height - (t.y + t.height)),
  );
  await trigger.click();
  const list = page.getByRole("listbox");
  await expect(list).toBeVisible({ timeout: 3000 });
  const ok = await list.evaluate((el) => {
    const r = el.getBoundingClientRect();
    if (r.height >= 120) return true;
    return [...el.querySelectorAll("[role=option]")].every((o) => {
      const b = o.getBoundingClientRect();
      return (
        b.top >= r.top - 1 &&
        b.bottom <= r.bottom + 1 &&
        b.top >= 0 &&
        b.bottom <= innerHeight
      );
    });
  });
  expect(ok, "list too short").toBe(true);
  await (
    option ?? page.getByRole("option", { name: new RegExp(`^${name} ·`) })
  ).click();
  await expect(trigger).toContainText(name);
}

Then(
  "the existing-asset picker opens a full list and picks {string}",
  async ({ page }, name: string) => {
    // Round 6: the asset is picked in the Into-investments name field.
    await new InvestmentsPo(page).pickExistingDest(name);
  },
);

Then(
  "the existing-wallet picker opens a full list and picks {string}",
  async ({ page }, name: string) => {
    const sheet = page.getByTestId("swap-sheet");
    await sheet.getByTestId("swap-dest-out").click();
    await sheet.getByTestId("wallet-target-existing").click();
    await expectFullList(page, sheet.getByTestId("swap-wallet-select"), name);
  },
);

Then(
  "the Sell tab of {string} asks how much was sold",
  async ({ page }, name: string) => {
    const po = new InvestmentsPo(page);
    await po.openSwap(name, "sell");
    await expect(po.swapSheet().getByTestId("swap-sell-sold")).toBeVisible();
    await fitsAndTranslated(page);
    await page.keyboard.press("Escape");
    await expect(po.swapSheet()).toHaveCount(0);
  },
);

// ── 13.1 round 3 (gaps 1–9) ──

Then(
  "the {string} header label has the asset row's weight",
  async ({ page }, uiType: string) => {
    const header = page.getByTestId(`investment-group-${uiType}`);
    // Compare like with like: both cards closed (open names are text-num-sm).
    if (
      await page
        .getByTestId(`investment-type-split-${uiType}`)
        .isVisible()
        .catch(() => false)
    )
      await header.click();
    await expect(
      page.getByTestId(`investment-type-split-${uiType}`),
    ).toHaveCount(0);
    const label = uiType[0]!.toUpperCase() + uiType.slice(1);
    const weight = (l: Locator) =>
      l.evaluate((el) => getComputedStyle(el).fontWeight);
    const own = await weight(
      header.getByText(label, { exact: true }).locator("visible=true"),
    );
    // R6-7: a closed group hides its assets — reopen to read one.
    await openGroup(page, uiType);
    const asset = page
      .locator('[data-testid^="holding-row-"]')
      .first()
      .locator("span.sm\\:hidden")
      .first();
    expect(own).toBe(await weight(asset));
  },
);

// Gap 2b: tapping the header never changes its size (it grew 56 → 69.6px
// while the asset row keeps 56).
Then(
  "the {string} header keeps its size when tapped",
  async ({ page }, uiType: string) => {
    const header = page.getByTestId(`investment-group-${uiType}`);
    const boxes = () =>
      header.evaluate((el) => ({
        root: el.getBoundingClientRect().width,
        h: el.getBoundingClientRect().height,
        parent: el.parentElement!.getBoundingClientRect().width,
        children: [...el.children].map((c) => ({
          cls: (c.getAttribute("class") ?? "").slice(0, 50),
          w: Math.round(c.getBoundingClientRect().width),
        })),
      }));
    // R6-7: groups start open — close, then measure the tap that opens.
    if ((await header.getAttribute("aria-expanded")) === "true")
      await header.click();
    await expect(header).toHaveAttribute("aria-expanded", "false");
    const before = await boxes();
    await header.click();
    await expect(
      page.getByTestId(`investment-type-split-${uiType}`),
    ).toBeVisible();
    const after = await boxes();
    console.log("[r3-size]", JSON.stringify({ before, after }));
    expect(Math.abs(after.root - before.root)).toBeLessThanOrEqual(0.5);
    // Like the asset row: the reveal fits the 56px card (measured 56 → 69.6).
    expect(Math.abs(after.h - before.h)).toBeLessThanOrEqual(1);
  },
);

// Gap 1: a tapped asset without P/L is two centred lines, no dash, no grow.
Then(
  "tapping the asset row {string} shows two centred lines without a dash",
  async ({ page }, name: string) => {
    const po = new InvestmentsPo(page);
    const id = await po.assetId(name);
    const card = po.row(name);
    const h0 = (await card.boundingBox())!.height;
    await page.getByTestId(`asset-row-${id}`).click();
    await expect(page.getByTestId(`asset-share-${id}`)).toBeVisible();
    await expect(card.getByText("—", { exact: true })).toHaveCount(0);
    const m = await card.evaluate((el) => {
      const r = el.getBoundingClientRect();
      const leaves = [...el.querySelectorAll<HTMLElement>("span, div")]
        .filter(
          (n) =>
            n.children.length === 0 &&
            (n.textContent ?? "").trim() !== "" &&
            n.getBoundingClientRect().width > 0,
        )
        .map((n) => n.getBoundingClientRect());
      const lines = new Set(
        leaves.map((b) => Math.round((b.top + b.bottom) / 12)),
      );
      const top = Math.min(...leaves.map((b) => b.top));
      const bottom = Math.max(...leaves.map((b) => b.bottom));
      return {
        h: r.height,
        lines: lines.size,
        offset: Math.abs((top + bottom) / 2 - (r.top + r.bottom) / 2),
      };
    });
    expect(Math.abs(m.h - h0), "card grew").toBeLessThanOrEqual(1);
    // Round 4: two centred columns (left 1–2 lines, right 2) — each column's
    // centring is @r4-columns; here: no dash, no grow, content centred.
    expect(m.offset, "not centred").toBeLessThanOrEqual(2);
  },
);

Then(
  "tapping the {string} header shows its share and no P\\/L",
  async ({ page }, uiType: string) => {
    await openGroup(page, uiType);
    await expect(
      page.getByTestId(`investment-type-share-${uiType}`),
    ).toBeVisible();
    await expect(
      page.getByTestId(`investment-group-${uiType}`).locator("[data-pl-line]"),
    ).toHaveCount(0);
    // Round 4: tapped, the currency hugs the amount (no column gap).
    const gap = await page
      .getByTestId(`investment-type-value-${uiType}`)
      .evaluate((el) => {
        const [ccy, amt] = [...el.children].map((c) =>
          c.getBoundingClientRect(),
        );
        return amt!.left - ccy!.right;
      });
    expect(gap, "currency → amount gap").toBeLessThanOrEqual(8);
  },
);

Then("values and shares line up on one right edge", async ({ page }) => {
  const rights = (sel: string) =>
    page
      .locator(sel)
      .evaluateAll((els) =>
        els
          .filter((e) => e.getBoundingClientRect().width > 0)
          .map((e) => Math.round(e.getBoundingClientRect().right)),
      );
  for (const sel of [
    '[data-testid^="asset-value-"], [data-testid^="investment-type-value-"]',
    '[data-testid^="asset-share-"], [data-testid^="investment-type-share-"]',
  ]) {
    const r = await rights(sel);
    expect(r.length, sel).toBeGreaterThanOrEqual(3);
    expect(Math.max(...r) - Math.min(...r), sel).toBeLessThanOrEqual(1);
  }
});

// Gap 2c: the header caption says what its amounts are.
Then(
  "the {string} header caption labels unrealized and realized",
  async ({ page }, uiType: string) => {
    const split = await new InvestmentsPo(page).typeSumUp(uiType);
    const caption = split.locator("[data-pl-caption]");
    await expect(caption).toHaveText(/unreal\.: .+real\.: .+/);
    await expect(caption.locator("[data-signed]")).toHaveCount(2);
    // Gap 17: one line; an overflowing caption scrolls instead of clipping.
    const fit = await caption.evaluate((el) => {
      const inner = el.firstElementChild as HTMLElement;
      return {
        over: inner.scrollWidth > el.clientWidth + 1,
        scrolls: inner.classList.contains("fit-line-scroll"),
        lines: Math.round(el.getBoundingClientRect().height / 15),
      };
    });
    expect(fit.lines, "caption is one line").toBeLessThanOrEqual(1);
    expect(fit.scrolls, "overflowing caption scrolls").toBe(fit.over);
  },
);

// Gap 4: a zero P/L is a grey rise with plus signs.
Then(
  "the asset row {string} shows a flat P\\/L",
  async ({ page }, name: string) => {
    const po = new InvestmentsPo(page);
    if ((page.viewportSize()?.width ?? 1280) < 640)
      await page.getByTestId(`asset-row-${await po.assetId(name)}`).click();
    const row = po.row(name);
    await expect(
      row.locator('[data-pl-trend="flat"]:visible').first(),
    ).toBeVisible();
    await expect(row).toContainText("+0%");
    await expect(row).toContainText("+0");
  },
);

Then(
  "the {string} header shows a flat P\\/L",
  async ({ page }, uiType: string) => {
    const split = await new InvestmentsPo(page).typeSumUp(uiType);
    const line = split.locator("[data-pl-line]").locator("visible=true");
    await expect(line.locator('[data-pl-trend="flat"]')).toBeVisible();
    await expect(line).toContainText("+0%");
    await expect(line).toContainText("+0");
  },
);

// Gaps 3a + 3b: New transaction's type list and the embedded form.
Then("the New transaction type list opens a full list", async ({ page }) => {
  await new InvestmentsPo(page).addButton().click();
  await page.getByTestId("new-tx-kind-sell").click();
  const trigger = page.getByTestId("new-tx-type");
  await expect(trigger).toHaveAttribute("role", "combobox");
  await expectFullList(
    page,
    trigger,
    "Broker",
    page.getByTestId("new-tx-type-option-broker"),
  );
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("new-tx-sheet")).toHaveCount(0);
});

Then(
  "picking {string} to {word} in New transaction keeps the type and asset above its form",
  async ({ page }, name: string, kind: string) => {
    const po = new InvestmentsPo(page);
    await po.startFromNewTransaction(
      kind as "sell" | "transfer",
      "broker",
      name,
    );
    const sheet = page.getByTestId("new-tx-sheet");
    await expect(sheet.getByTestId("new-tx-type")).toBeVisible();
    await expect(sheet.getByTestId("new-tx-asset")).toBeVisible();
    await expect(page.getByTestId("swap-sheet")).toHaveCount(0);
    await fitsAndTranslated(page);
    await page.keyboard.press("Escape");
    await expect(sheet).toHaveCount(0);
  },
);

// Gap 3c: no "everything" toggles.
Then("there is no {string} in the sale", async ({ page }, testId: string) => {
  await expect(page.getByTestId(testId)).toHaveCount(0);
});

When("I switch the Swap sheet to {word}", async ({ page }, tab: string) => {
  await page.getByTestId(`swap-tab-${tab}`).click();
});

// Gap 9: square delete with a shadow on its left edge.
Then(
  "the revealed buttons in the ledger of {string} are square with a left inset shadow on Edit",
  async ({ page }, name: string) => {
    const po = new InvestmentsPo(page);
    const ledger = await po.openLedger(name);
    const del = ledger
      .locator('[data-testid^="ledger-delete-"]:not([aria-disabled="true"])')
      .first();
    await po.revealDelete(del);
    const look = (el: Element) => {
      const cs = getComputedStyle(el);
      return { radius: cs.borderTopLeftRadius, shadow: cs.boxShadow };
    };
    const row0 = del.locator("xpath=ancestor::*[@data-ledger-row][1]");
    const edit = await row0
      .locator('[data-testid^="ledger-edit-"]')
      .evaluate(look);
    const d = await del.evaluate(look);
    expect(d.radius).toBe("0px");
    expect(edit.radius).toBe("0px");
    expect(edit.shadow).toContain("inset");
    expect(d.shadow).toBe("none");
    // Gap 11: the swiped row is shaded on its left; gap 12: smaller qty line.
    const row = del.locator("xpath=ancestor::*[@data-ledger-row][1]");
    await expect(row.locator("[data-ledger-swipe-shade]")).toHaveCSS(
      "opacity",
      "1",
    );
  },
);

// ── 13.1 round 4 (gaps 1–11) ──

async function startNewTxSell(
  page: import("@playwright/test").Page,
  ui: string,
) {
  await new InvestmentsPo(page).addButton().click();
  await page.getByTestId("new-tx-kind-sell").click();
  await page.getByTestId("new-tx-type").click();
  await page.getByTestId(`new-tx-type-option-${ui}`).click();
}

When(
  "I start New transaction → Sell on the {string} type",
  async ({ page }, ui: string) => startNewTxSell(page, ui),
);

// Gap 3.
Then(
  "switching New transaction to Transfer keeps {string} and shows the asset field",
  async ({ page }, label: string) => {
    await page.getByTestId("new-tx-kind-transfer").click();
    const sheet = page.getByTestId("new-tx-sheet");
    await expect(sheet.getByTestId("new-tx-type")).toContainText(label);
    await expect(sheet.getByTestId("new-tx-asset")).toBeVisible();
  },
);

// Gap 5.
Then(
  "New transaction has picked {string} and shows its Sell form",
  async ({ page }, name: string) => {
    const sheet = page.getByTestId("new-tx-sheet");
    await expect(sheet.getByTestId("new-tx-asset")).toHaveValue(name);
    await expect(sheet.getByTestId("swap-sell-sold")).toBeVisible();
  },
);

// Gap 6.
Then(
  "the New transaction Sell type list shows an icon for {string}",
  async ({ page }, ui: string) => {
    await new InvestmentsPo(page).addButton().click();
    await page.getByTestId("new-tx-kind-sell").click();
    await page.getByTestId("new-tx-type").click();
    await expect(
      page.getByTestId(`new-tx-type-option-${ui}`).locator("[data-type-icon]"),
    ).toBeVisible();
  },
);

/** Both [data-col] stacks of a card are centred in it (±1px). */
async function expectCentredColumns(card: Locator, what: string) {
  const m = await card.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const mid = (r.top + r.bottom) / 2;
    return [...el.querySelectorAll("[data-col]")]
      .filter((c) => c.getBoundingClientRect().height > 0)
      .map((c) => {
        const b = c.getBoundingClientRect();
        return {
          col: c.getAttribute("data-col"),
          off: Math.abs((b.top + b.bottom) / 2 - mid),
        };
      });
  });
  expect(m.map((x) => x.col).sort(), `${what}: columns`).toEqual([
    "left",
    "right",
  ]);
  for (const x of m)
    expect(x.off, `${what}: ${x.col} off centre`).toBeLessThanOrEqual(1);
}

// Gap 1.
Then(
  "the {string} header and the assets {string} and {string} centre both columns, closed and tapped",
  async ({ page }, ui: string, a: string, b: string) => {
    const po = new InvestmentsPo(page);
    const header = page.getByTestId(`investment-group-${ui}`);
    const cards: Array<[Locator, string, () => Promise<void>]> = [
      [header, `${ui} header`, () => header.click()],
      ...[a, b].map(
        (n) =>
          [
            po.row(n),
            n,
            async () =>
              page.getByTestId(`asset-row-${await po.assetId(n)}`).click(),
          ] as [Locator, string, () => Promise<void>],
      ),
    ];
    // R6-7: groups start open — close the header first; its tap reopens.
    if ((await header.getAttribute("aria-expanded")) === "true")
      await header.click();
    await expect(header).toHaveAttribute("aria-expanded", "false");
    for (const [card, what, tap] of cards) {
      await expectCentredColumns(card, `${what} closed`);
      await tap();
      await page.waitForTimeout(250);
      await expectCentredColumns(card, `${what} tapped`);
    }
  },
);

// Gap 2.
Then(
  "the {string} header carries the type icon and its assets do not",
  async ({ page }, ui: string) => {
    await expect(
      page.getByTestId(`investment-group-${ui}`).locator("[data-type-icon]"),
    ).toBeVisible();
    await expect(
      page.locator("[data-asset-block] [data-type-icon]"),
    ).toHaveCount(0);
  },
);

// Gaps 4 + 7.
When(
  "I open the Add form on {string} and focus the name",
  async ({ page }, type: string) => {
    const po = new InvestmentsPo(page);
    await po.openAdd(type);
    await po.focusName();
  },
);

Then(
  // Round 4 (user): value + currency only — no quantity.
  "the first suggestion shows its value and currency only",
  async ({ page }) => {
    const meta = page
      .getByTestId("asset-name-option-0")
      .locator("[data-asset-meta]");
    await expect(meta).toHaveText(/^[\d.,\s]+ [A-Z]{3}$/);
  },
);

Then("picking it shows no join note", async ({ page }) => {
  await page.getByTestId("asset-name-option-0").dispatchEvent("mousedown");
  await expect(page.getByTestId("asset-name-note")).toHaveCount(0);
});

// Gap 11.
Then(
  "the Add form name field shows the pick-or-create hint",
  async ({ page }) => {
    await new InvestmentsPo(page).openAdd("collectibles");
    await expect(page.getByTestId("asset-name-hint")).toBeVisible();
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");
  },
);

Then(
  "the transfer {string} field of {string} shows the pick-or-create hint",
  async ({ page }, _to: string, name: string) => {
    await page.goto(page.url());
    await new InvestmentsPo(page).openSwap(name, "transfer");
    await expect(
      page.getByTestId("swap-sheet").getByTestId("asset-name-hint"),
    ).toBeVisible();
    await page.keyboard.press("Escape");
  },
);

Then(
  "the New transaction asset field shows no pick-or-create hint",
  async ({ page }) => {
    await page.goto(page.url());
    await startNewTxSell(page, "broker");
    // Only the asset field itself (the Sell form below has its own fields).
    await expect(
      page
        .getByTestId("new-tx-asset")
        .locator("xpath=..")
        .getByTestId("asset-name-hint"),
    ).toHaveCount(0);
  },
);

// Gap 8.
When("I set the Swap date to yesterday", async ({ page }) => {
  const d = new Date(Date.now() - 86_400_000).toLocaleDateString("en-CA");
  await page.getByTestId("swap-date").fill(d);
});

Then(
  "the Swap tabs carry {string} and yesterday's date through Transfer and Buy",
  async ({ page }, v: string) => {
    const d = new Date(Date.now() - 86_400_000).toLocaleDateString("en-CA");
    await page.getByTestId("swap-tab-transfer").click();
    await expect(page.getByTestId("swap-transfer-qty")).toHaveValue(v);
    await expect(page.getByTestId("swap-date")).toHaveValue(d);
    await page.getByTestId("swap-tab-buy").click();
    await expect(page.getByTestId("swap-buy-qty")).toHaveValue(v);
    await expect(page.getByTestId("swap-date")).toHaveValue(d);
  },
);

Then(
  "New transaction carries {string} and {string} from Sell to Buy and back",
  async ({ page }, name: string, v: string) => {
    const po = new InvestmentsPo(page);
    await po.startFromNewTransaction("sell", "broker", name);
    const sheet = page.getByTestId("new-tx-sheet");
    await sheet.getByTestId("swap-sell-sold").fill(v);
    await page.getByTestId("new-tx-kind-buy").click();
    await expect(page.getByRole("alertdialog")).toHaveCount(0);
    await expect(sheet.getByTestId("holding-sheet-type")).toContainText(
      "Broker",
    );
    await expect(sheet.getByTestId("holding-sheet-name")).toHaveValue(name);
    await expect(sheet.getByTestId("swap-buy-amount")).toHaveValue(v);
    await page.getByTestId("new-tx-kind-sell").click();
    await expect(sheet.getByTestId("new-tx-asset")).toHaveValue(name);
    await expect(sheet.getByTestId("swap-sell-sold")).toHaveValue(v);
  },
);

// Round-6 gap 3 (user): one Into-investments field; pick in place, or new.
When(
  "I sell {string} into investments picking {string}",
  async ({ page }, src: string, name: string) => {
    const po = new InvestmentsPo(page);
    await po.openSwap(src, "sell");
    const sheet = po.swapSheet();
    await po.fillSoldFromLeft(sheet, "0");
    await sheet.getByTestId("swap-dest-invest").click();
    await po.pickExistingDest(name);
    await expect(sheet.getByTestId("swap-sell-existing")).toHaveCount(0);
    await expect(sheet.getByTestId("swap-dest-new-marker")).toHaveCount(0);
  },
);

Then(
  "the picked destination shows its value and I can save",
  async ({ page }) => {
    const po = new InvestmentsPo(page);
    await expect(po.swapSheet().getByTestId("asset-name-picked")).toContainText(
      "Asset value",
    );
    const received = po.swapSheet().getByTestId("swap-sell-received");
    if (await received.isVisible().catch(() => false))
      await received.fill("100");
    expect(await po.submitSwap("/sell")).toBe(201);
  },
);

When(
  "I sell {string} into a new investment {string}",
  async ({ page }, src: string, name: string) => {
    const po = new InvestmentsPo(page);
    await po.openSwap(src, "sell");
    const sheet = po.swapSheet();
    await po.fillSoldFromLeft(sheet, "0");
    await sheet.getByTestId("swap-dest-invest").click();
    await sheet
      .getByTestId("holding-form-destination")
      .getByTestId("holding-sheet-name")
      .fill(name);
    await page.keyboard.press("Escape");
    await expect(sheet.getByTestId("swap-dest-new-marker")).toContainText(name);
    await sheet.getByTestId("swap-sell-received").fill("100");
    expect(await po.submitSwap("/sell")).toBe(201);
  },
);

// Gap 10.
Then(
  "tapping the linked entry in the ledger of {string} opens {string} at the matching entry",
  async ({ page }, from: string, to: string) => {
    const po = new InvestmentsPo(page);
    const ledger = await po.openLedger(from);
    await ledger.locator('[data-testid^="ledger-link-"]').first().click();
    const target = page.getByTestId(`asset-ledger-${await po.assetId(to)}`);
    await expect(target).toBeVisible({ timeout: 10000 });
    const flashed = target.locator('[data-flash="true"]');
    await expect(flashed).toBeVisible();
    await expect(flashed).toBeInViewport();
  },
);

// Round 4 (user): archive is an explicit action; buying into it revives it.
When(
  "I show the {string} group in {string}",
  async ({ page }, type: string, ccy: string) => {
    await new InvestmentsPo(page).pickGroupCurrency(type, ccy);
  },
);

Then(
  "the {string} group total reads in {string} and differs from {string}",
  async ({ page }, type: string, ccy: string, before: string) => {
    const value = page.getByTestId(`investment-type-value-${type}`);
    await expect(value).toContainText(ccy, { timeout: 15000 });
    await expect(value).not.toContainText(before, { timeout: 15000 });
  },
);

When("I hide the asset {string}", async ({ page }, name: string) => {
  await new InvestmentsPo(page).hide(name);
});

When("I open the hidden assets of {string}", async ({ page }, type: string) => {
  const link = new InvestmentsPo(page).hiddenLink(type);
  await expect(link).toHaveAttribute("data-count", "1", { timeout: 15000 });
  await link.click();
});

Then(
  "the hidden asset {string} is listed fainter",
  async ({ page }, name: string) => {
    const box = page.locator(
      `[data-testid^="hidden-asset-"]:has([data-testid="holding-row-${name}"])`,
    );
    await expect(box).toBeVisible();
    await expect(box).toHaveCSS("opacity", "0.5");
  },
);

When("I unhide the asset {string}", async ({ page }, name: string) => {
  await new InvestmentsPo(page).unhide(name);
});

Then(
  "the {string} group has no hidden assets",
  async ({ page }, type: string) => {
    await expect(new InvestmentsPo(page).hiddenLink(type)).toHaveCount(0, {
      timeout: 15000,
    });
  },
);

Then(
  "the {string} Add form offers {string} as hidden and buying {string} into it brings it back",
  async ({ page }, type: string, name: string, amount: string) => {
    const po = new InvestmentsPo(page);
    await po.openAdd(type);
    await po.focusName();
    const option = page
      .getByRole("option")
      .filter({ hasText: new RegExp(`^${name}`) });
    await expect(option).toContainText("Hidden");
    // Round 5: picking it restores it (by id) and opens its Buy form.
    const restored = page.waitForResponse(
      (r) => r.url().endsWith("/restore") && r.request().method() === "POST",
      { timeout: 15000 },
    );
    await option.dispatchEvent("mousedown");
    expect((await restored).ok()).toBe(true);
    await buyInPickedForm(page, "1", amount);
    await expect(po.row(name)).toBeVisible({ timeout: 10000 });
  },
);

// Gap 22 (user): a tapped crypto / metal row must not grow wider than its card.
Then(
  "tapping the asset row {string} keeps everything inside its card",
  async ({ page }, name: string) => {
    const po = new InvestmentsPo(page);
    const card = po.row(name);
    const w0 = (await card.boundingBox())!.width;
    await page.getByTestId(`asset-row-${await po.assetId(name)}`).click();
    await page.waitForTimeout(400);
    const m = await card.evaluate((el) => {
      const r = el.getBoundingClientRect();
      const out = [...el.querySelectorAll<HTMLElement>("*")]
        .filter((c) => {
          const b = c.getBoundingClientRect();
          return b.width > 0 && b.right > r.right + 1;
        })
        .map(
          (c) =>
            `${c.tagName}.${(c.getAttribute("class") ?? "").slice(0, 40)} ${Math.round(c.getBoundingClientRect().right - r.right)}px`,
        );
      return {
        w: r.width,
        out,
        page: document.scrollingElement!.scrollWidth - innerWidth,
      };
    });
    console.log("[gap22]", name, JSON.stringify({ w0, ...m }));
    console.log(
      "[gap24]",
      JSON.stringify(
        await card.evaluate((el) =>
          [
            "[data-col=left]",
            "[data-col=right]",
            "[data-asset-caption]",
            "[data-asset-caption] > span",
            '[data-testid^="asset-share-"]',
            '[data-testid^="asset-value-"]',
            "[data-col=left] > *",
          ].map((sel) => {
            const n = el.querySelector<HTMLElement>(sel);
            if (!n) return [sel, null];
            const cs = getComputedStyle(n);
            return [
              sel,
              Math.round(n.getBoundingClientRect().width),
              n.scrollWidth,
              cs.width,
              cs.marginRight,
              cs.minWidth,
            ];
          }),
        ),
      ),
    );
    expect(Math.abs(m.w - w0), "card width changed").toBeLessThanOrEqual(1);
    expect(m.out, "content past the card").toEqual([]);
    expect(m.page, "page scrolls sideways").toBeLessThanOrEqual(0);
  },
);

// Round 5: names are not unique — Add always creates.
When(
  "I add a {string} asset {string} in {string} worth {string}",
  async ({ page }, type: string, name: string, ccy: string, amount: string) => {
    const po = new InvestmentsPo(page);
    await po.openAdd(type);
    const sheet = po.sheet();
    await sheet.getByTestId("holding-sheet-name").fill(name);
    await sheet.getByTestId("holding-sheet-name").press("Escape");
    const native = sheet.getByTestId("currency-picker-native");
    if (await native.isVisible().catch(() => false))
      await native.selectOption(ccy);
    else {
      await sheet.getByRole("combobox", { name: "Currency" }).click();
      await page.getByTestId(`currency-option-${ccy}`).first().click();
    }
    await sheet.getByTestId("holding-sheet-amount").fill(amount);
    const posted = page.waitForResponse(
      (r) =>
        /\/budgets\/[^/]+\/investments(\?.*)?$/.test(r.url()) &&
        r.request().method() === "POST",
      { timeout: 15000 },
    );
    await page.getByTestId("holding-sheet-submit").click();
    const res = await posted;
    expect(res.ok(), await res.text()).toBe(true);
  },
);

Then(
  "there are {int} asset rows {string}",
  async ({ page }, n: number, name: string) => {
    await expect(new InvestmentsPo(page).row(name)).toHaveCount(n);
  },
);

// Gap 26: an asset with nothing but its opening entry is deleted, not archived.
When("I delete the asset {string}", async ({ page }, name: string) => {
  await new InvestmentsPo(page).deleteAsset(name);
});

When(
  "I pick {string} from the catalog in the {string} Add form",
  async ({ page }, label: string, type: string) => {
    const po = new InvestmentsPo(page);
    await po.openAdd(type);
    await po.pickCatalogInstrument(label);
  },
);

Then(
  "the Add form buys at {string} in {string} with the currency locked",
  async ({ page }, price: string, ccy: string) => {
    const po = new InvestmentsPo(page);
    await po.expectLockedBuyCurrency(price, ccy);
  },
);

When(
  "I sell {string} leaving {string} out of investments receiving {string} with the note {string}",
  async (
    { page },
    name: string,
    left: string,
    received: string,
    note: string,
  ) => {
    const po = new InvestmentsPo(page);
    await po.openSwap(name, "sell");
    expect(await po.sell({ left, dest: "out", received, note })).toBe(201);
  },
);

Then(
  "the ledger of {string} shows the note {string}",
  async ({ page }, name: string, note: string) => {
    const ledger = await new InvestmentsPo(page).openLedger(name);
    await expect(
      ledger.locator('[data-testid^="ledger-note-"]').first(),
    ).toHaveText(note);
  },
);

When(
  "I edit the newest entry of {string} to the note {string}",
  async ({ page }, name: string, note: string) => {
    await new InvestmentsPo(page).editNewestNote(name, note);
  },
);
