import { expect } from "@playwright/test";
import { createBdd } from "playwright-bdd";
import { test } from "../fixtures/fresh-user-per-scenario";
import { InvestmentCategoryPo } from "../page-objects/InvestmentCategoryPo";

const { Given, When, Then } = createBdd(test);

async function withBudgetGuc(
  budgetId: string,
  userId: string,
  run: (client: import("pg").PoolClient) => Promise<void>,
): Promise<void> {
  const { Pool } = await import("pg");
  const dbUrl =
    process.env.DATABASE_URL_APP?.replace("@db:", "@localhost:") ?? "";
  if (!dbUrl) throw new Error("DATABASE_URL_APP not set — cannot seed r33");
  const pool = new Pool({ connectionString: dbUrl });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`SELECT set_config('app.tenant_ids', $1, true)`, [
      `{${budgetId}}`,
    ]);
    await client.query(`SELECT set_config('app.current_user_id', $1, true)`, [
      userId,
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

async function budgetCurrency(budgetId: string): Promise<string> {
  let ccy = "USD";
  await withBudgetGuc(budgetId, "00000000-0000-0000-0000-000000000001", async (c) => {
    const r = await c.query<{ default_currency: string }>(
      `SELECT default_currency FROM tenancy.budgets WHERE id = $1::uuid`,
      [budgetId],
    );
    ccy = r.rows[0]?.default_currency ?? "USD";
  });
  return ccy;
}

Given(
  "the budget has the Investments category enabled",
  async ({ freshUser }) => {
    await withBudgetGuc(freshUser.budgetId, freshUser.userId, async (c) => {
      await c.query(
        `INSERT INTO budgeting.categories
           (id, tenant_id, name, actor_user_id, sort_index, color_key,
            reserve_excluded, is_investment, investment_limit_mode)
         VALUES (gen_random_uuid(), $1::uuid, 'Investments', $2::uuid, -1,
                 'green', true, true, 'smart')`,
        [freshUser.budgetId, freshUser.userId],
      );
    });
  },
);

Given(
  /^the budget has a monthly income of (\d+) cents$/,
  async ({ freshUser }, cents: string) => {
    const ccy = await budgetCurrency(freshUser.budgetId);
    const amount = Number(cents) / 100; // incomes.amount is currency units
    await withBudgetGuc(freshUser.budgetId, freshUser.userId, async (c) => {
      await c.query(
        `INSERT INTO budgeting.incomes
           (tenant_id, name, amount, currency, cadence, active, actor_user_id)
         VALUES ($1::uuid, 'Salary', $2, $3, 'MONTHLY', true, $4::uuid)`,
        [freshUser.budgetId, amount, ccy, freshUser.userId],
      );
    });
  },
);

When("I open the Investments category editor", async ({ page }) => {
  await new InvestmentCategoryPo(page).openEditor();
});

Then(
  "the first spendings column is the Investments category",
  async ({ page }) => {
    const po = new InvestmentCategoryPo(page);
    await po.header().waitFor({ state: "visible" });
    await expect(
      po.firstColumn().getByTestId("column-header-investments"),
    ).toBeVisible();
  },
);

Then("the Investments column shows an overinvested row", async ({ page }) => {
  await expect(
    new InvestmentCategoryPo(page).overinvestedRow(),
  ).toBeVisible();
});

Then("the smart limit option is disabled", async ({ page }) => {
  await expect(new InvestmentCategoryPo(page).smartOption()).toBeDisabled();
});

Then("the smart-limit income hint is shown", async ({ page }) => {
  await expect(new InvestmentCategoryPo(page).smartHint()).toBeVisible();
});

Then(
  /^the Investments column planned equals (\d+) cents$/,
  async ({ page }, cents: string) => {
    const n = Number(cents);
    const whole = Math.floor(n / 100);
    const frac = n % 100;
    const expected =
      frac === 0 ? String(whole) : `${whole}${String(frac).padStart(2, "0")}`;
    const po = new InvestmentCategoryPo(page);
    await expect(po.plannedCell()).toBeVisible();
    await expect
      .poll(async () => {
        const txt = (await po.plannedCell().textContent()) ?? "";
        return txt.replace(/\D/g, "");
      })
      .toBe(expected);
  },
);
