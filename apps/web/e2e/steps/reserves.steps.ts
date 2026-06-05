import { createBdd } from "playwright-bdd";
import { expect } from "@playwright/test";
import { test } from "../fixtures/fresh-user-per-scenario";
import { ReservesPo } from "../page-objects/ReservesPo";

const { Given, When, Then } = createBdd(test);

// ───────────────────────────────────────────────────────────────────────────
// Seed helpers — wrap pg.Pool with the tenant-id RLS GUC so seeds satisfy the
// FORCE ROW LEVEL SECURITY policies (mirrors common-steps.ts / tasks.steps.ts).
// DATABASE_URL_APP host is rewritten @db: → @localhost: so the seed runs from
// the host while the app talks to the compose `db` service.
// ───────────────────────────────────────────────────────────────────────────

async function withTenantClient<T>(
  budgetId: string,
  fn: (client: import("pg").PoolClient) => Promise<T>,
): Promise<T> {
  const { Pool } = await import("pg");
  const dbUrl =
    process.env.DATABASE_URL_APP?.replace("@db:", "@localhost:") ?? "";
  if (!dbUrl)
    throw new Error("DATABASE_URL_APP not set — cannot seed reserves");
  const pool = new Pool({ connectionString: dbUrl });
  try {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(`SELECT set_config('app.tenant_ids', $1, true)`, [
        `{${budgetId}}`,
      ]);
      const result = await fn(client);
      await client.query("COMMIT");
      return result;
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  } finally {
    await pool.end();
  }
}

/** Budget default currency — the RESERVE wallet + limit must match it. */
async function budgetCurrency(budgetId: string): Promise<string> {
  return await withTenantClient(budgetId, async (client) => {
    const res = await client.query<{ default_currency: string }>(
      `SELECT default_currency FROM tenancy.budgets WHERE id = $1::uuid`,
      [budgetId],
    );
    return (res.rows[0]?.default_currency ?? "USD").trim();
  });
}

// ───────────────────────────────────────────────────────────────────────────
// Given — seed a category + monthly limit
// ───────────────────────────────────────────────────────────────────────────

Given(
  /^the budget has a category "(.+?)" with a monthly limit of (\d+) cents$/,
  async ({ freshUser }, name: string, limitCents: string) => {
    const ccy = await budgetCurrency(freshUser.budgetId);
    const amount = Number(limitCents);
    await withTenantClient(freshUser.budgetId, async (client) => {
      const cat = await client.query<{ id: string }>(
        `INSERT INTO budgeting.categories (id, tenant_id, name, actor_user_id, sort_index)
         VALUES (gen_random_uuid(), $1::uuid, $2, $3::uuid, 0)
         RETURNING id`,
        [freshUser.budgetId, name, freshUser.userId],
      );
      const categoryId = cat.rows[0]!.id;
      // Open-ended limit row (effective_to NULL) the reserve engine reads as the
      // current effLimit. cushion == normal so cushion-mode does not change it.
      await client.query(
        `INSERT INTO budgeting.category_limits
           (id, tenant_id, category_id, normal_amount, normal_currency,
            cushion_amount, cushion_currency, effective_from, effective_to,
            actor_user_id)
         VALUES (gen_random_uuid(), $1::uuid, $2::uuid, $3, $4, $3, $4,
                 (now() AT TIME ZONE 'UTC')::date, NULL, $5::uuid)`,
        [freshUser.budgetId, categoryId, amount, ccy, freshUser.userId],
      );
    });
  },
);

// ───────────────────────────────────────────────────────────────────────────
// Given — seed a RESERVE wallet with a known balance (drives userDefined)
// ───────────────────────────────────────────────────────────────────────────

Given(
  /^the budget has a RESERVE wallet "(.+?)" holding (\d+) cents$/,
  async ({ freshUser }, name: string, balanceCents: string) => {
    const ccy = await budgetCurrency(freshUser.budgetId);
    // current_balance is numeric(19,4) in MAJOR units; convert cents → major.
    const major = (Number(balanceCents) / 100).toFixed(4);
    await withTenantClient(freshUser.budgetId, async (client) => {
      await client.query(
        `INSERT INTO budgeting.wallets
           (id, tenant_id, name, currency, current_balance, actor_user_id, wallet_type)
         VALUES (gen_random_uuid(), $1::uuid, $2, $3, $4::numeric, $5::uuid, 'RESERVE')`,
        [freshUser.budgetId, name, ccy, major, freshUser.userId],
      );
    });
  },
);

// ───────────────────────────────────────────────────────────────────────────
// Given — disable reserves for the budget (reserves_enabled=false)
// ───────────────────────────────────────────────────────────────────────────

Given("reserves are disabled for the budget", async ({ freshUser }) => {
  await withTenantClient(freshUser.budgetId, async (client) => {
    await client.query(
      `UPDATE tenancy.budgets SET reserves_enabled = false WHERE id = $1::uuid`,
      [freshUser.budgetId],
    );
  });
});

// ───────────────────────────────────────────────────────────────────────────
// When — navigate + interact
// ───────────────────────────────────────────────────────────────────────────

When("I open the reserves tab for the budget", async ({ page, freshUser }) => {
  await page.goto(`/en/budgets/${freshUser.budgetId}/reserves`);
  await page
    .waitForLoadState("networkidle", { timeout: 10000 })
    .catch(() => {});
});

When(
  /^I set the reserve for "(.+?)" to "(.+?)"$/,
  async ({ page }, name: string, value: string) => {
    const reserves = new ReservesPo(page);
    await reserves.setReserve(name, value);
  },
);

// ───────────────────────────────────────────────────────────────────────────
// Then — assertions
// ───────────────────────────────────────────────────────────────────────────

Then(
  /^the reserve cell for "(.+?)" is visible$/,
  async ({ page }, name: string) => {
    const reserves = new ReservesPo(page);
    await expect(await reserves.reserveCell(name)).toBeVisible();
  },
);

Then(
  /^the used cell for "(.+?)" is visible$/,
  async ({ page }, name: string) => {
    const reserves = new ReservesPo(page);
    await expect(await reserves.usedCell(name)).toBeVisible();
  },
);

Then('the reserves tab has no "Share" column', async ({ page }) => {
  const reserves = new ReservesPo(page);
  expect(await reserves.hasShareColumn()).toBe(false);
});

Then("the surplus banner is visible", async ({ page }) => {
  const reserves = new ReservesPo(page);
  await expect(reserves.surplusBanner()).toBeVisible();
});

Then(
  /^the surplus banner shows the "(TOPUP|WITHDRAW|NONE)" direction$/,
  async ({ page }, direction: string) => {
    const reserves = new ReservesPo(page);
    await reserves.assertSurplusDirection(
      direction as "TOPUP" | "WITHDRAW" | "NONE",
    );
  },
);

Then(
  /^the reserve cell for "(.+?)" shows "(.+?)"$/,
  async ({ page }, name: string, value: string) => {
    const reserves = new ReservesPo(page);
    const cell = await reserves.reserveCell(name);
    await expect(cell).toContainText(value, { timeout: 5000 });
  },
);

Then("the reserves disabled notice is visible", async ({ page }) => {
  const reserves = new ReservesPo(page);
  await expect(reserves.disabledNotice()).toBeVisible();
});
