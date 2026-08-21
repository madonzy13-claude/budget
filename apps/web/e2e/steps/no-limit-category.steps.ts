/**
 * no-limit-category.steps.ts — "No limit" categories (mig 0083).
 *
 * Categories, limits and spendings are seeded directly over SQL rather than
 * driven through the UI: these scenarios are about how the GRID renders an
 * unbounded category, and clicking a category into existence first would put
 * the whole create flow between the test and what it is actually asserting.
 * The slider itself is exercised by the third scenario.
 */
import { createBdd } from "playwright-bdd";
import { expect } from "@playwright/test";
import { test } from "../fixtures/fresh-user-per-scenario";
import { SpendingsPo } from "../page-objects/SpendingsPo";
import { OverviewPo } from "../page-objects/OverviewPo";

const { Given, When, Then } = createBdd(test);

/** app_role + the RLS GUCs, so the seed is subject to the same isolation the
 *  app is. Seeding as a superuser would hide a policy mistake. */
async function withTenant<T>(
  tenantId: string,
  userId: string,
  fn: (q: (sql: string, params?: unknown[]) => Promise<unknown>) => Promise<T>,
): Promise<T> {
  const { Pool } = await import("pg");
  const dbUrl = process.env.DATABASE_URL_APP?.replace("@db:", "@localhost:");
  if (!dbUrl) throw new Error("DATABASE_URL_APP not set — cannot seed");
  const pool = new Pool({ connectionString: dbUrl });
  const client = await pool.connect();
  try {
    await client.query(`SET app.current_user_id = '${userId}'`);
    await client.query(`SET app.tenant_ids = '{${tenantId}}'`);
    return await fn((sql, params) => client.query(sql, params as never[]));
  } finally {
    client.release();
    await pool.end();
  }
}

const monthStart = () => {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`;
};

async function seedCategory(
  tenantId: string,
  userId: string,
  name: string,
  limit: { noLimit: boolean; normalCents: number },
): Promise<void> {
  await withTenant(tenantId, userId, async (q) => {
    const res = (await q(
      `INSERT INTO budgeting.categories (id, tenant_id, name, created_at, actor_user_id)
       VALUES (gen_random_uuid(), $1::uuid, $2, now(), $3::uuid)
       RETURNING id`,
      [tenantId, name, userId],
    )) as { rows: { id: string }[] };
    const categoryId = res.rows[0]!.id;
    await q(
      `INSERT INTO budgeting.category_limits
         (tenant_id, category_id, normal_amount, normal_currency,
          cushion_amount, cushion_currency, no_limit,
          effective_from, actor_user_id)
       VALUES ($1::uuid, $2::uuid, $3::bigint, 'USD', 0::bigint, 'USD',
               $4::boolean, $5::date, $6::uuid)`,
      [
        tenantId,
        categoryId,
        String(limit.normalCents),
        limit.noLimit,
        monthStart(),
        userId,
      ],
    );
  });
}

Given(
  /^the budget has a category "(.+?)" with no limit$/,
  async ({ freshUser }, name: string) => {
    await seedCategory(freshUser.budgetId, freshUser.userId, name, {
      noLimit: true,
      normalCents: 0,
    });
  },
);

Given(
  /^the budget has a category "(.+?)" with a limit of (\d+)$/,
  async ({ freshUser }, name: string, major: string) => {
    await seedCategory(freshUser.budgetId, freshUser.userId, name, {
      noLimit: false,
      normalCents: Number(major) * 100,
    });
  },
);

Given(
  /^"(.+?)" has (\d+) of spending this month$/,
  async ({ freshUser }, name: string, major: string) => {
    const cents = String(Number(major) * 100);
    await withTenant(freshUser.budgetId, freshUser.userId, async (q) => {
      const cat = (await q(
        `SELECT id FROM budgeting.categories
          WHERE tenant_id = $1::uuid AND name = $2`,
        [freshUser.budgetId, name],
      )) as { rows: { id: string }[] };
      const categoryId = cat.rows[0]!.id;
      // expense_ledger carries no actor_user_id, and fx_as_of is NOT NULL.
      await q(
        `INSERT INTO budgeting.expense_ledger
           (tenant_id, budget_id, category_id, kind,
            amount_original_cents, currency_original, amount_converted_cents,
            fx_rate, fx_as_of, transaction_date, confirmed_at)
         VALUES ($1::uuid, $1::uuid, $2::uuid, 'SPENDING',
                 $3::bigint, 'USD', $3::bigint,
                 1, current_date, $4::date, now())`,
        [freshUser.budgetId, categoryId, cents, monthStart()],
      );
    });
  },
);

When(
  /^I open the category editor for "(.+?)"$/,
  async ({ page }, name: string) => {
    const po = new SpendingsPo(page);
    const header = po.columnHeader(name);
    await expect(header).toBeVisible({ timeout: 10000 });
    await header.hover();
    await po.columnPen(name).click();
    await expect(po.catSliderContent()).toBeVisible({ timeout: 8000 });
  },
);

Then(
  /^the overspent cell for "(.+?)" shows a dash$/,
  async ({ page }, name: string) => {
    const po = new SpendingsPo(page);
    await expect(po.columnOverspent(name)).toHaveText("—", { timeout: 15000 });
  },
);

Then(
  /^the overspent cell for "(.+?)" is not a dash$/,
  async ({ page }, name: string) => {
    const po = new SpendingsPo(page);
    await expect(po.columnOverspent(name)).toBeVisible({ timeout: 15000 });
    await expect(po.columnOverspent(name)).not.toHaveText("—");
  },
);

Then(
  /^the reserves-used cell for "(.+?)" shows a dash$/,
  async ({ page }, name: string) => {
    const po = new SpendingsPo(page);
    await expect(po.columnReservesUsed(name)).toHaveText("—", {
      timeout: 15000,
    });
  },
);

Then("the no-limit toggle is checked", async ({ page }) => {
  const po = new SpendingsPo(page);
  // A segmented Button pair, not a checkbox — selection reads off aria-pressed.
  await expect(po.catSliderNoLimit()).toHaveAttribute("aria-pressed", "true");
});


When(
  /^I open the overview planned section for "(.+?)"$/,
  async ({ page, freshUser }, name: string) => {
    const po = new OverviewPo(page);
    await po.open("en", freshUser.budgetId);
    await po.expandSection("planned");
    await po.categorySelect().click();
    await po.categoryOption(name).click();
    await page.waitForTimeout(1500);
  },
);

Then("the planned total reads as unlimited", async ({ page }) => {
  // ∞ rather than a number: the plan is not a cap.
  await expect(
    page.getByTestId("planned-totals").getByText("\u221E"),
  ).toBeVisible({ timeout: 15000 });
});

Then("the planned breakdown reports no overspend", async ({ page }) => {
  // The over/under figure is a dash — there is nothing to be over.
  await expect(
    page.getByTestId("planned-total-difference"),
  ).toContainText("\u2014", { timeout: 15000 });
});
