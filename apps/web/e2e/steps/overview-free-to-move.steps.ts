/**
 * overview-free-to-move.steps.ts — "Free to move" against unanswered occurrences.
 *
 * An occurrence that has come due and has not been confirmed or dismissed is
 * money the household still HOLDS and has already COMMITTED. Until 260825 the
 * simulator took it as far as the tooltip and no further, on the reasoning that
 * the category's daily burn already carried it — which is true only for a
 * start-month occurrence in a category that HAS a limit with room left in it.
 * An unbounded category has no plan and therefore no burn, so nothing carried
 * it, and the card offered the money as withdrawable.
 *
 * Seeded over SQL under app_role + the RLS GUCs (same isolation the app runs
 * under): this scenario is about one figure's arithmetic, and driving the wallet
 * and category create flows through the UI first would put them between the test
 * and what it asserts.
 */
import { createBdd } from "playwright-bdd";
import { expect } from "@playwright/test";
import { test } from "../fixtures/fresh-user-per-scenario";
import { OverviewPo } from "../page-objects/OverviewPo";

const { Given, Then } = createBdd(test);

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

/** Amount privacy keeps the real digits OUT of the DOM until a figure is tapped
 *  (SlotAmount). The scenario is about the number, not the reveal gesture. */
Given("amounts are shown in full", async ({ freshUser }) => {
  await withTenant(freshUser.budgetId, freshUser.userId, async (q) => {
    await q(
      `UPDATE tenancy.budgets SET amount_privacy_enabled = false WHERE id = $1::uuid`,
      [freshUser.budgetId],
    );
  });
});

/** A wallet of a named type. SPENDINGS is the forecast's opening cash — it will
 *  not spend cushion or reserve money where it sits — while CUSHION money with
 *  no requirement behind it puts the cushion card into its surplus note. */
Given(
  /^the budget has a (SPENDINGS|CUSHION|RESERVE) wallet holding (\d+) cents$/,
  async ({ freshUser }, walletType: string, balanceCents: string) => {
    await withTenant(freshUser.budgetId, freshUser.userId, async (q) => {
      const b = (await q(
        `SELECT default_currency FROM tenancy.budgets WHERE id = $1::uuid`,
        [freshUser.budgetId],
      )) as { rows: { default_currency: string }[] };
      // Wallet currency = budget currency, so nothing here depends on a live
      // FX rate (see [[project_e2e_fx_cache_live_api]]).
      const ccy = b.rows[0]!.default_currency;
      // current_balance is numeric(19,4) in MAJOR units.
      const major = (Number(balanceCents) / 100).toFixed(4);
      await q(
        `INSERT INTO budgeting.wallets
           (id, tenant_id, name, currency, current_balance, actor_user_id, wallet_type)
         VALUES (gen_random_uuid(), $1::uuid, $5, $2, $3::numeric, $4::uuid, $6)`,
        [
          freshUser.budgetId,
          ccy,
          major,
          freshUser.userId,
          walletType,
          walletType,
        ],
      );
    });
  },
);

/** An occurrence due today that nobody has answered: confirmed_at NULL,
 *  dismissed_at NULL — exactly what the draft generator leaves behind. */
Given(
  /^"(.+?)" has an unconfirmed occurrence of (\d+) cents dated today$/,
  async ({ freshUser }, categoryName: string, cents: string) => {
    await withTenant(freshUser.budgetId, freshUser.userId, async (q) => {
      const cat = (await q(
        `SELECT id FROM budgeting.categories
          WHERE tenant_id = $1::uuid AND name = $2`,
        [freshUser.budgetId, categoryName],
      )) as { rows: { id: string }[] };
      const categoryId = cat.rows[0]?.id;
      if (!categoryId) throw new Error(`category not found: ${categoryName}`);
      const b = (await q(
        `SELECT default_currency FROM tenancy.budgets WHERE id = $1::uuid`,
        [freshUser.budgetId],
      )) as { rows: { default_currency: string }[] };
      await q(
        `INSERT INTO budgeting.expense_ledger
           (tenant_id, budget_id, category_id, kind, note,
            amount_original_cents, currency_original, amount_converted_cents,
            fx_rate, fx_as_of, transaction_date, confirmed_at)
         VALUES ($1::uuid, $1::uuid, $2::uuid, 'SPENDING', 'Mortgage',
                 $3::bigint, $4, $3::bigint,
                 1, current_date, current_date, NULL)`,
        [freshUser.budgetId, categoryId, cents, b.rows[0]!.default_currency],
      );
    });
  },
);

/** Whole units only, and the locale decides the separators and the symbol —
 *  so compare the digits rather than a formatted string. */
Then(
  /^"Free to move" reads (\d+)$/,
  async ({ page }, expected: string | number) => {
    const overview = new OverviewPo(page);
    await expect(overview.freeToMove()).toBeVisible({ timeout: 15000 });
    // String(): playwright-bdd hands a numeric capture back as a NUMBER, and
    // `toBe` is Object.is — 600 vs "600" fails on a card reading exactly right.
    await expect
      .poll(
        async () =>
          ((await overview.freeToMove().textContent()) ?? "").replace(
            /\D/g,
            "",
          ),
        { timeout: 15000 },
      )
      .toBe(String(expected));
  },
);

/** Nothing spare and no shortfall → the row is simply absent. "Plan looks
 *  solid" used to sit here; it read as praise the card had not earned, and it
 *  read the same a złoty above zero as it did well clear of it (user, 260825).
 *  "Upcoming" is checked too — that figure belongs to the no-projection case,
 *  and falling through to it would answer a different question. */
Then("the card says nothing about spare money", async ({ page }) => {
  const overview = new OverviewPo(page);
  await expect(overview.card("available-to-spend")).toBeVisible({
    timeout: 15000,
  });
  // The projection has to have LANDED before absence means anything: the row is
  // missing while it loads too, so asserting straight away would pass on a card
  // that has not been told the answer yet.
  await expect(page.getByTestId("projection-timeline")).toBeVisible({
    timeout: 20000,
  });
  await expect(overview.freeToMove()).toHaveCount(0);
  await expect(page.getByTestId("spend-balanced-note")).toHaveCount(0);
});

/** The 2x2 grid sized its two rows independently, so a card whose note wrapped
 *  to a second line made its whole row taller than the one above (user
 *  screenshot, 260825). Measured, not eyeballed: only a real layout engine can
 *  settle a question about resolved pixel heights. */
Then("the four summary cards are all the same height", async ({ page }) => {
  const overview = new OverviewPo(page);
  await expect(overview.card("cushion")).toBeVisible({ timeout: 15000 });
  // The heights settle as the projection and wealth queries land and notes
  // reflow, so poll rather than measuring the first paint.
  await expect
    .poll(
      async () => {
        const h = await overview.gridCardHeights();
        return Math.max(...h) - Math.min(...h);
      },
      { timeout: 15000 },
    )
    .toBe(0);
});

/** An explicit width, so a scenario about wrapping states the width it wraps
 *  at instead of inheriting one. */
Given(
  /^I am on a (\d+)px-wide viewport$/,
  async ({ page }, width: string | number) => {
    await page.setViewportSize({ width: Number(width), height: 800 });
  },
);
