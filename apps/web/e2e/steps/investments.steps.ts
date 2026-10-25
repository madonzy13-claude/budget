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

Given(
  "a custom holding {string} worth {int} cents in group {string} exists in my budget",
  async ({ freshUser }, name: string, amountCents: number, group: string) => {
    await withBudgetGuc(freshUser.budgetId, async (client) => {
      await client.query(
        `INSERT INTO budgeting.investments
           (id, tenant_id, budget_id, name, holding_type, group_name, quantity,
            current_price_cents, current_price_currency, sort_order, created_at)
         VALUES (gen_random_uuid(), $1::uuid, $1::uuid, $2, 'other', $4, '1', $3, 'USD', 0, now())`,
        [freshUser.budgetId, name, amountCents, group],
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

When("I expand the group {string}", async ({ page }, group: string) => {
  await new InvestmentsPo(page).expandGroup(group);
});

// Distinct phrasing from the global "I reload the page" (workspace.steps.ts) so
// this feature stays on a single test fixture (fresh-user-per-scenario).
When("I reload the wallets tab", async ({ page }) => {
  await page.reload();
  await page
    .waitForLoadState("networkidle", { timeout: 10000 })
    .catch(() => {});
});

Then("the group {string} is expanded", async ({ page }, group: string) => {
  await expect(new InvestmentsPo(page).groupToggle(group)).toHaveAttribute(
    "aria-expanded",
    "true",
  );
});

When(
  "I drag the holding {string} into group {string}",
  async ({ page }, name: string, group: string) => {
    await new InvestmentsPo(page).dragIntoGroup(name, group);
  },
);

Then(
  "the holding {string} is in group {string}",
  async ({ page }, name: string, group: string) => {
    const po = new InvestmentsPo(page);
    await po.groupHeader(group).waitFor({ state: "visible" });
    await po.row(name).waitFor({ state: "visible" });
  },
);

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

Then(
  "the amounts inside group {string} are narrower than the group total",
  async ({ page }, group: string) => {
    const box = (scope: Locator) =>
      scope.locator('div[style*="min-width"]').first().boundingBox();
    const header = await box(page.getByTestId(`investment-group-${group}`));
    const rows = new InvestmentsPo(page);
    const a = await box(rows.row("Flat A"));
    const b = await box(rows.row("Flat B"));
    expect(header && a && b).toBeTruthy();
    // Rows line up with each other…
    expect(Math.abs(a!.x - b!.x)).toBeLessThan(1);
    // …on their own width, not the group total's.
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

When(
  "I tap the amount of holding {string}",
  async ({ page }, name: string) => {
    await new InvestmentsPo(page)
      .row(name)
      .locator('[data-testid^="holding-amount-readonly-"]')
      .click();
  },
);

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
