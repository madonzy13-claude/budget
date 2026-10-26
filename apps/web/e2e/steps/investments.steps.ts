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
    });
  },
);

When(
  "I sell {string} leaving {string} out of investments receiving {string}",
  async ({ page }, name: string, left: string, received: string) => {
    const po = new InvestmentsPo(page);
    await po.openSell(name);
    expect(await po.sell({ left, dest: "out", received })).toBe(200);
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

Then(
  "the {string} type shows realized {string}",
  async ({ page }, uiType: string, amount: string) => {
    await expect(
      page.getByTestId(`investment-type-realized-${uiType}`),
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
      // Its automatic Start entry, as migration 0087 backfilled for live rows.
      await client.query(
        `INSERT INTO budgeting.investment_history
           (tenant_id, budget_id, holding_id, kind, effective_date, amount_cents,
            amount_currency, cost_delta_cents, cost_currency, flow_cents, flow_currency)
         SELECT i.tenant_id, i.budget_id, i.id, 'start', current_date, i.buy_price_cents,
                i.buy_currency, i.buy_price_cents, i.buy_currency, i.buy_price_cents, i.buy_currency
           FROM budgeting.investments i
          WHERE i.budget_id = $1::uuid AND i.name = $2`,
        [freshUser.budgetId, name],
      );
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
    await po.openSell(name);
    expect(await po.sell({ left, dest: "new", newName: cash, received })).toBe(
      200,
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
    await po.openSell(name);
    expect(
      await po.sell({ left, dest: "existing", existingName: target, received }),
    ).toBe(200);
  },
);

When("I open the sale of {string}", async ({ page }, name: string) => {
  await new InvestmentsPo(page).openSell(name);
});

When(
  "I set {string} in the sale to {string}",
  async ({ page }, field: string, v: string) => {
    const id = field === "Value left" ? "sell-left" : "sell-received";
    await page.getByTestId("sell-sheet").getByTestId(id).fill(v);
  },
);

Then("the sale says {string}", async ({ page }, copy: string) => {
  await expect(page.getByTestId("sell-sheet").getByText(copy)).toBeVisible();
});

Then("the sale cannot be recorded", async ({ page }) => {
  await expect(page.getByTestId("sell-submit")).toBeDisabled();
});

Then("the sale date cannot be after today", async ({ page }) => {
  const today = new Date().toLocaleDateString("en-CA");
  await expect(page.getByTestId("sell-date")).toHaveAttribute("max", today);
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

Then(
  "the investments total shows realized {string}",
  async ({ page }, amount: string) => {
    await expect(page.getByTestId("investments-total-realized")).toContainText(
      amount,
    );
  },
);

// ── Phase 13: Edit "What happened?", History, Delete ──

const HAPPENED: Record<string, string> = {
  "Value changed": "value_change",
  "Added money": "add",
  "Withdrew money": "withdraw",
};

When(
  "I edit {string} to a value of {string} because I {string}",
  async ({ page }, name: string, value: string, what: string) => {
    const po = new InvestmentsPo(page);
    await po.openEdit(name);
    await page.getByTestId("holding-sheet-actual").fill(value);
    await page.getByTestId(`happened-${HAPPENED[what]}`).click();
    await po.saveEdit("adjust");
  },
);

When(
  "I edit {string} to a quantity of {string} paying {string}",
  async ({ page }, name: string, qty: string, paid: string) => {
    const po = new InvestmentsPo(page);
    await po.openEdit(name);
    await page.getByTestId("holding-sheet-quantity").fill(qty);
    await page.getByTestId("happened-paid").fill(paid);
    await po.saveEdit("adjust");
  },
);

When(
  "I edit {string} to a quantity of {string}",
  async ({ page }, name: string, qty: string) => {
    const po = new InvestmentsPo(page);
    await po.openEdit(name);
    await page.getByTestId("holding-sheet-quantity").fill(qty);
    await po.saveEdit("none");
  },
);

Then("the sale opens with {string} left", async ({ page }, left: string) => {
  const sheet = page.getByTestId("sell-sheet");
  await sheet.waitFor({ state: "visible" });
  await expect(sheet.getByTestId("sell-left")).toHaveValue(left);
});

When(
  "I finish the sale out of investments receiving {string}",
  async ({ page }, received: string) => {
    const sheet = page.getByTestId("sell-sheet");
    await sheet.getByTestId("sell-dest-out").click();
    await sheet.getByTestId("sell-received").fill(received);
    const res = page.waitForResponse(
      (r) => r.url().endsWith("/sell") && r.request().method() === "POST",
    );
    await sheet.getByTestId("sell-submit").click();
    expect((await res).status()).toBe(200);
  },
);

When(
  "I change the type of {string} to {string}",
  async ({ page }, name: string, uiType: string) => {
    const po = new InvestmentsPo(page);
    await po.openEdit(name);
    await page.getByTestId("holding-sheet-type").click();
    await page.getByTestId(`holding-type-${uiType}`).click();
    await po.saveEdit("patch");
  },
);

When(
  "I add a broker {string} deposited {string} worth {string} opened on {string}",
  async ({ page }, name: string, dep: string, cur: string, date: string) => {
    await new InvestmentsPo(page).addBroker(name, dep, cur, date);
  },
);

Then(
  "the history of {string} lists {string}",
  async ({ page }, name: string, text: string) => {
    const po = new InvestmentsPo(page);
    if (
      !(await po
        .sheet()
        .isVisible()
        .catch(() => false))
    )
      await po.openEdit(name);
    const h = await po.openHistory();
    await expect(h).toContainText(text);
  },
);

When(
  "I delete the {string} entry of {string}",
  async ({ page }, kind: string, name: string) => {
    const po = new InvestmentsPo(page);
    await po.openEdit(name);
    await po.deleteHistoryEntry(kind);
    await page.keyboard.press("Escape");
  },
);

Then(
  "the {string} type shows no realized gain",
  async ({ page }, uiType: string) => {
    await expect(
      page.getByTestId(`investment-type-realized-${uiType}`),
    ).toHaveCount(0);
  },
);

Then(
  "the {string} type shows realized exactly {string}",
  async ({ page }, uiType: string, amount: string) => {
    await expect(
      page.getByTestId(`investment-type-realized-${uiType}`),
    ).toHaveText(`incl. realized ${amount}`);
  },
);

When("I delete the holding {string}", async ({ page }, name: string) => {
  const dialog = await new InvestmentsPo(page).askDelete(name);
  await expect(dialog).toContainText("entire history");
  const res = page.waitForResponse(
    (r) =>
      /\/investments\/[0-9a-f-]+$/.test(r.url()) &&
      r.request().method() === "DELETE",
  );
  await page.getByTestId("holding-delete-confirm-action").click();
  expect((await res).ok()).toBe(true);
});

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
  "I start editing {string} to a value of {string}",
  async ({ page }, name: string, value: string) => {
    await new InvestmentsPo(page).openEdit(name);
    await page.getByTestId("holding-sheet-actual").fill(value);
  },
);

Then(
  "the edit sheet shows What happened and History without overflow",
  async ({ page }) => {
    const po = new InvestmentsPo(page);
    await expect(page.getByTestId("happened-withdraw")).toBeVisible();
    await po.openHistory();
    const sheet = po.sheet();
    const overflow = await sheet.evaluate((el) => {
      const r = el.getBoundingClientRect();
      return [...el.querySelectorAll<HTMLElement>("*")]
        .filter((c) => {
          const b = c.getBoundingClientRect();
          return b.width > 0 && b.right > r.right + 1;
        })
        .map((c) => `${c.tagName}[${c.getAttribute("data-testid") ?? ""}] "${(c.textContent ?? "").slice(0, 40)}"`);
    });
    expect(overflow).toEqual([]);
  },
);
