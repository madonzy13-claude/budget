import { expect } from "@playwright/test";
import { createBdd } from "playwright-bdd";
import { test } from "../fixtures/fresh-user-per-scenario";
import { BdpPo } from "../page-objects/BdpPo";
import {
  OverviewPo,
  type OverviewSectionSlug,
} from "../page-objects/OverviewPo";
import { ProjectionTimelinePo } from "../page-objects/ProjectionTimelinePo";

const { Given, When, Then } = createBdd(test);

// Seed helper — wrap pg.Pool with the tenant-id RLS GUC so seeds satisfy the
// row-level policy. DATABASE_URL_APP host is rewritten @db: → @localhost: so the
// seed runs from outside the compose network (mirrors reserves.steps).
async function withTenantClient<T>(
  budgetId: string,
  fn: (client: import("pg").PoolClient) => Promise<T>,
): Promise<T> {
  const { Pool } = await import("pg");
  const dbUrl =
    process.env.DATABASE_URL_APP?.replace("@db:", "@localhost:") ?? "";
  if (!dbUrl)
    throw new Error("DATABASE_URL_APP not set — cannot seed overview data");
  const pool = new Pool({ connectionString: dbUrl });
  try {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      // budget_wealth_snapshots' RLS policy casts the GUC directly to uuid[]
      // (current_setting('app.tenant_ids')::uuid[]), so it must be a PG array
      // literal — bare uuid trips "malformed array literal".
      await client.query(`SELECT set_config('app.tenant_ids', $1, true)`, [
        `{${budgetId}}`,
      ]);
      const out = await fn(client);
      await client.query("COMMIT");
      return out;
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

// A single wealth snapshot makes the wealth series non-empty so the section
// renders its charts (incl. the investments-view pie region) instead of the
// "history starts collecting" empty state. The snapshot carries investment value,
// so the budget has the Investments feature ON — otherwise the capitalization/
// investments toggle is hidden (Phase 11 UAT: toggle gated on investments_enabled).
Given(
  /^the budget has a wealth snapshot of (\d+) cents$/,
  async ({ freshUser }, cents: string) => {
    await withTenantClient(freshUser.budgetId, async (client) => {
      const ccy = await client
        .query<{
          default_currency: string;
        }>(`SELECT default_currency FROM tenancy.budgets WHERE id = $1::uuid`, [
          freshUser.budgetId,
        ])
        .then((r) => (r.rows[0]?.default_currency ?? "USD").trim());
      await client.query(
        `UPDATE tenancy.budgets SET investments_enabled = true WHERE id = $1::uuid`,
        [freshUser.budgetId],
      );
      await client.query(
        `INSERT INTO budgeting.budget_wealth_snapshots
           (tenant_id, budget_id, captured_at, capitalization_cents, investment_value_cents, currency)
         VALUES ($1::uuid, $1::uuid, now(), $2::bigint, $2::bigint, $3)`,
        [freshUser.budgetId, cents, ccy],
      );
    });
  },
);

const OVERVIEW_CARDS = [
  "capitalization",
  "available-to-spend",
  "available-reserves",
  "overspent",
  "cushion",
] as const;

Then("the five overview summary cards are visible", async ({ page }) => {
  const bdp = new BdpPo(page);
  for (const name of OVERVIEW_CARDS) {
    await expect(bdp.overviewCard(name)).toBeVisible();
  }
});

Then("the page has no horizontal scroll", async ({ page }) => {
  // SC1: no element forces the document wider than the viewport.
  const overflows = await page.evaluate(() => {
    const el = document.scrollingElement ?? document.documentElement;
    return el.scrollWidth > el.clientWidth;
  });
  expect(overflows).toBe(false);
});

// ───────────────────────────────────────────────────────────────────────────
// Sections (11-10): expand + body assertions
// ───────────────────────────────────────────────────────────────────────────

When(
  "I expand the {string} overview section",
  async ({ page }, slug: string) => {
    await new OverviewPo(page).expandSection(slug as OverviewSectionSlug);
  },
);

Then(
  "the {string} overview section body is visible",
  async ({ page }, slug: string) => {
    await expect(
      new OverviewPo(page).sectionBody(slug as OverviewSectionSlug),
    ).toBeVisible();
  },
);

Then("the planned category selector is visible", async ({ page }) => {
  await expect(new OverviewPo(page).categorySelect()).toBeVisible();
});

// ───────────────────────────────────────────────────────────────────────────
// Range selector (11-10)
// ───────────────────────────────────────────────────────────────────────────

When(
  "I select the {string} overview range",
  async ({ page }, label: string) => {
    await new OverviewPo(page).rangePill(label).click();
  },
);

Then(
  "the {string} overview range is active",
  async ({ page }, label: string) => {
    await expect(new OverviewPo(page).rangePill(label)).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  },
);

// ───────────────────────────────────────────────────────────────────────────
// Planned category re-scope (11-10) — needs a seeded category
// (reuses reserves.steps' "the budget has a category ..." Given)
// ───────────────────────────────────────────────────────────────────────────

When(
  "I select the category {string} in the Planned section",
  async ({ page }, name: string) => {
    await new OverviewPo(page).categorySelect().selectOption({ label: name });
  },
);

Then(
  "the Planned category selector shows {string}",
  async ({ page }, name: string) => {
    const select = new OverviewPo(page).categorySelect();
    const value = await select.inputValue();
    const label = await select.locator(`option[value="${value}"]`).innerText();
    expect(label.trim()).toBe(name);
  },
);

// ───────────────────────────────────────────────────────────────────────────
// Wealth toggle + pie region (11-10)
// ───────────────────────────────────────────────────────────────────────────

When(
  "I switch the wealth view to {string}",
  async ({ page }, label: string) => {
    await new OverviewPo(page).wealthToggle(label).click();
  },
);

Then("the wealth view {string} is active", async ({ page }, label: string) => {
  await expect(new OverviewPo(page).wealthToggle(label)).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});

Then("the wealth pie region is visible", async ({ page }) => {
  await expect(new OverviewPo(page).pieRegion()).toBeVisible();
});

// ───────────────────────────────────────────────────────────────────────────
// Projection timeline (tasks-redesign)
// ───────────────────────────────────────────────────────────────────────────

Then("I see the cash-flow projection banner", async ({ page }) => {
  await new ProjectionTimelinePo(page).expectVisible();
});

Then(
  "the projection band has at least {int} day cells",
  async ({ page }, n: number) => {
    await new ProjectionTimelinePo(page).expectAtLeastDays(n);
  },
);

When("I hover the last day of the projection band", async ({ page }) => {
  await new ProjectionTimelinePo(page).hoverLastDay();
});

Then("I see the projection tooltip", async ({ page }) => {
  await new ProjectionTimelinePo(page).expectTooltip();
});
