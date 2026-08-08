/**
 * reserve-rebalance.steps.ts — the Overview's rebalance dialog (260805).
 *
 * The seed has to produce a reserve that is genuinely SHORT with nothing left
 * overspent, which takes a little care: a positive adjust pays off outstanding
 * overspend before it builds the buffer, so a category still carrying one never
 * lands on its target and the dialog would rightly keep offering the move.
 *
 * The shape used here — one big overspend in the FIRST month, then several
 * quiet months whose unspent limit pays it off — leaves overspent at zero, a
 * small reserve, and a `needed` sized by that first month's dip. Exactly the
 * "short buffer, nothing owed" case the dialog is for.
 */
import { createBdd } from "playwright-bdd";
import { expect } from "@playwright/test";
import { test } from "../fixtures/fresh-user-per-scenario";
import { OverviewPo } from "../page-objects/OverviewPo";

const { Given, When, Then } = createBdd(test);

async function withTenantClient<T>(
  budgetId: string,
  fn: (client: import("pg").PoolClient) => Promise<T>,
): Promise<T> {
  const { Pool } = await import("pg");
  const dbUrl =
    process.env.DATABASE_URL_APP?.replace("@db:", "@localhost:") ?? "";
  if (!dbUrl)
    throw new Error("DATABASE_URL_APP not set — cannot seed reserve rebalance");
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

async function budgetCurrency(budgetId: string): Promise<string> {
  return await withTenantClient(budgetId, async (client) => {
    const res = await client.query<{ default_currency: string }>(
      `SELECT default_currency FROM tenancy.budgets WHERE id = $1::uuid`,
      [budgetId],
    );
    return (res.rows[0]?.default_currency ?? "USD").trim();
  });
}

async function categoryId(budgetId: string, name: string): Promise<string> {
  return await withTenantClient(budgetId, async (client) => {
    const res = await client.query<{ id: string }>(
      `SELECT id FROM budgeting.categories
        WHERE tenant_id = $1::uuid AND name = $2 LIMIT 1`,
      [budgetId, name],
    );
    const id = res.rows[0]?.id;
    if (!id) throw new Error(`category not found: ${name}`);
    return id;
  });
}

// ───────────────────────────────────────────────────────────────────────────
// Given — a limit that has been in force since a past month
// ───────────────────────────────────────────────────────────────────────────

Given(
  /^the budget has a category "(.+?)" with a monthly limit of (\d+) cents from (\d+) months ago$/,
  async (
    { freshUser },
    name: string,
    limitCents: string,
    monthsAgo: string,
  ) => {
    const ccy = await budgetCurrency(freshUser.budgetId);
    await withTenantClient(freshUser.budgetId, async (client) => {
      const cat = await client.query<{ id: string }>(
        `INSERT INTO budgeting.categories (id, tenant_id, name, actor_user_id, sort_index)
         VALUES (gen_random_uuid(), $1::uuid, $2, $3::uuid, 0)
         RETURNING id`,
        [freshUser.budgetId, name, freshUser.userId],
      );
      // effective_from is a MONTH START that far back: effectiveForMonth wants
      // effective_from ≤ the month start, so a mid-month date reads as no limit.
      await client.query(
        `INSERT INTO budgeting.category_limits
           (id, tenant_id, category_id, normal_amount, normal_currency,
            cushion_amount, cushion_currency, effective_from, effective_to,
            actor_user_id)
         VALUES (gen_random_uuid(), $1::uuid, $2::uuid, $3, $4, $3, $4,
                 (date_trunc('month', (now() AT TIME ZONE 'UTC')::date)
                   - ($5::int || ' months')::interval)::date,
                 NULL, $6::uuid)`,
        [
          freshUser.budgetId,
          cat.rows[0]!.id,
          Number(limitCents),
          ccy,
          Number(monthsAgo),
          freshUser.userId,
        ],
      );
    });
  },
);

// ───────────────────────────────────────────────────────────────────────────
// Given — a confirmed spend dated in a past month
// ───────────────────────────────────────────────────────────────────────────

Given(
  /^the budget has a confirmed spend of (\d+) cents in "(.+?)" (\d+) months ago$/,
  async (
    { freshUser },
    amountCents: string,
    name: string,
    monthsAgo: string,
  ) => {
    const ccy = await budgetCurrency(freshUser.budgetId);
    const catId = await categoryId(freshUser.budgetId, name);
    await withTenantClient(freshUser.budgetId, async (client) => {
      // Dated mid-month so a month-length difference can never push it into a
      // neighbouring month.
      await client.query(
        `INSERT INTO budgeting.expense_ledger
           (id, tenant_id, budget_id, category_id, transaction_date,
            amount_original_cents, currency_original, amount_converted_cents,
            fx_rate, fx_as_of, note, confirmed_at, kind, created_at, updated_at)
         VALUES (gen_random_uuid(), $1::uuid, $1::uuid, $2::uuid,
            (date_trunc('month', (now() AT TIME ZONE 'UTC')::date)
              - ($3::int || ' months')::interval + interval '14 days')::date,
            $4::bigint, $5, $4::bigint, 1::numeric,
            (now() AT TIME ZONE 'UTC')::date,
            'e2e past overspend', now(), 'SPENDING', now(), now())`,
        [
          freshUser.budgetId,
          catId,
          Number(monthsAgo),
          Number(amountCents),
          ccy,
        ],
      );
    });
  },
);

// ───────────────────────────────────────────────────────────────────────────
// When — reach the dialog
// ───────────────────────────────────────────────────────────────────────────

Given(
  /^I open the reserve rebalance dialog for "(.+?)"$/,
  async ({ page, freshUser }, _budgetName: string) => {
    const po = new OverviewPo(page);
    await po.open("en", freshUser.budgetId);
    // The fit chart stands down on a range with no finished month, and the
    // seeded history reaches further back than the presets do.
    await po.rangePill("All").click();
    await po.expandSection("reserves");
    await expect(po.rebalanceTrigger()).toBeVisible();
    await po.rebalanceTrigger().click();
    await expect(po.rebalanceDialog()).toBeVisible();
  },
);

When(
  /^I press the rebalance button for "(.+?)"$/,
  async ({ page }, name: string) => {
    const po = new OverviewPo(page);
    const before = await po.rebalanceAction(name).getAttribute("data-kind");
    await po.rebalanceAction(name).click();
    // The row re-reads itself once the move lands; waiting on the flip keeps a
    // following step from asserting against the pre-move render.
    await expect(po.rebalanceAction(name)).not.toHaveAttribute(
      "data-kind",
      before ?? "",
    );
  },
);

When(
  /^I set the rebalance target for "(.+?)" to "(.+?)"$/,
  async ({ page }, name: string, value: string) => {
    const field = new OverviewPo(page).rebalanceTarget(name);
    await field.fill(value);
  },
);

// ───────────────────────────────────────────────────────────────────────────
// Then
// ───────────────────────────────────────────────────────────────────────────

Then(
  /^the rebalance row for "(.+?)" offers to "(rebalance|undo)"$/,
  async ({ page }, name: string, kind: string) => {
    await expect(new OverviewPo(page).rebalanceAction(name)).toHaveAttribute(
      "data-kind",
      kind,
    );
  },
);

Then(
  "the rebalance target fields all share one left edge",
  async ({ page }) => {
    const fields = page.locator('[data-testid^="reserve-rebalance-target-"]');
    const count = await fields.count();
    // Two rows at least, or the assertion cannot fail.
    expect(count).toBeGreaterThan(1);
    const lefts: number[] = [];
    for (let i = 0; i < count; i++) {
      const box = await fields.nth(i).boundingBox();
      if (box) lefts.push(Math.round(box.x));
    }
    expect(new Set(lefts).size).toBe(1);
  },
);


Then(
  /^the reserve ledger for "(.+?)" holds a delta of (-?\d+) cents$/,
  async ({ freshUser }, name: string, deltaCents: string) => {
    const catId = await categoryId(freshUser.budgetId, name);
    const rows = await withTenantClient(freshUser.budgetId, async (client) => {
      const res = await client.query<{ delta_cents: string }>(
        `SELECT delta_cents::text AS delta_cents
           FROM budgeting.category_reserve_adjustments
          WHERE tenant_id = $1::uuid AND category_id = $2::uuid
          ORDER BY occurred_at`,
        [freshUser.budgetId, catId],
      );
      return res.rows.map((r) => r.delta_cents);
    });
    expect(rows).toContain(String(deltaCents));
  },
);

Then(
  /^the reserve ledger for "(.+?)" nets to (-?\d+) cents$/,
  async ({ freshUser }, name: string, netCents: string) => {
    const catId = await categoryId(freshUser.budgetId, name);
    const net = await withTenantClient(freshUser.budgetId, async (client) => {
      const res = await client.query<{ net: string }>(
        `SELECT COALESCE(SUM(delta_cents), 0)::text AS net
           FROM budgeting.category_reserve_adjustments
          WHERE tenant_id = $1::uuid AND category_id = $2::uuid`,
        [freshUser.budgetId, catId],
      );
      return res.rows[0]?.net ?? "0";
    });
    expect(net).toBe(String(netCents));
  },
);
