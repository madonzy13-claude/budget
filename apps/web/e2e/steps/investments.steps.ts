import { expect } from "@playwright/test";
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
