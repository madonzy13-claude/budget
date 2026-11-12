import { expect, type Page } from "@playwright/test";
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

// One wealth snapshot carrying an investment value AND its cost basis, so the
// investments view has a P/L (value − cost) at that point. No investment
// ledger on a fresh budget, so the chart reads the snapshot's stored cost.
async function seedInvestmentSnapshot(
  budgetId: string,
  value: number,
  cost: number,
  daysAgo: number,
) {
  await withTenantClient(budgetId, async (client) => {
    const ccy = await client
      .query<{
        default_currency: string;
      }>(`SELECT default_currency FROM tenancy.budgets WHERE id = $1::uuid`, [
        budgetId,
      ])
      .then((r) => (r.rows[0]?.default_currency ?? "USD").trim());
    await client.query(
      `UPDATE tenancy.budgets SET investments_enabled = true WHERE id = $1::uuid`,
      [budgetId],
    );
    await client.query(
      `INSERT INTO budgeting.budget_wealth_snapshots
         (tenant_id, budget_id, captured_at, capitalization_cents,
          investment_value_cents, currency, investment_cost_basis_cents)
       VALUES ($1::uuid, $1::uuid, now() - make_interval(days => $4::int),
               $2::bigint, $2::bigint, $3, $5::bigint)`,
      [budgetId, value, ccy, daysAgo, cost],
    );
  });
}

Given(
  "the budget held investments worth {int} cents costing {int} cents {int} days ago",
  async ({ freshUser }, value: number, cost: number, daysAgo: number) =>
    seedInvestmentSnapshot(freshUser.budgetId, value, cost, daysAgo),
);

Then(
  "the wealth {string} metric reads {string}",
  async ({ page }, metric: string, pct: string) => {
    await expect(new OverviewPo(page).wealthMetricPct(metric)).toHaveText(pct);
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
    await new OverviewPo(page).pickOnlyCategory(name);
  },
);

Then(
  "the Planned category selector shows {string}",
  async ({ page }, name: string) => {
    // The picker is a popover trigger now, not a <select> — its own label is
    // what the member reads, so that is what this asserts.
    await expect(new OverviewPo(page).categorySelect()).toHaveText(name);
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

Then(
  "every month name on the projection strip clears its divider",
  async ({ page }) => {
    await new ProjectionTimelinePo(page).expectMonthLabelsClearDividers();
  },
);

// ───────────────────────────────────────────────────────────────────────────
// The member's own forecast window (260904)
// ───────────────────────────────────────────────────────────────────────────

Then(
  "the forecast horizon reads {int} days",
  async ({ page }, days: number) => {
    await new ProjectionTimelinePo(page).expectHorizonReads(days);
  },
);

When(
  "I set the forecast horizon to {int} days",
  async ({ page }, days: number) => {
    await new ProjectionTimelinePo(page).setHorizonBySnap(days);
  },
);

When(
  "I drag the forecast horizon to {int} days",
  async ({ page }, days: number) => {
    await new ProjectionTimelinePo(page).dragHorizonTo(days);
  },
);

/** A full page load, which is what proves the pick outlived the tab. */
When("I reload the overview", async ({ page }) => {
  await page.reload();
});

Then(
  "the projection window spans {int} days",
  async ({ page }, days: number) => {
    await new ProjectionTimelinePo(page).expectWindowSpansDays(days);
  },
);

// Two snapshots make the day P/L render: one at yesterday's close (23:00 UTC,
// always inside the card's from=yesterday window) and one now at the live value.
Given(
  /^the budget's capitalization was (\d+) cents at yesterday's close$/,
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
        `INSERT INTO budgeting.budget_wealth_snapshots
           (tenant_id, budget_id, captured_at, capitalization_cents, investment_value_cents, currency)
         VALUES ($1::uuid, $1::uuid, date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' - interval '1 hour', $2::bigint, 0, $3),
                ($1::uuid, $1::uuid, now(), $4::bigint, 0, $3)`,
        [freshUser.budgetId, cents, ccy, "1989762500"],
      );
    });
  },
);

Then(
  /^the capitalization hero ends before its day P\/L begins$/,
  async ({ page }) => {
    const hero = page.getByTestId("capitalization-hero");
    const pl = page.getByTestId("capitalization-pl");
    await expect(pl).toBeVisible();
    // Let the count-up animation land on the final figure before measuring.
    await expect(hero).toContainText("19,897,625");
    // The hero's TEXT width, not its box: an overflowing number spills past
    // its own (shrunk) box, so the box alone would pass on the buggy build.
    const heroRight = await hero.evaluate((el) => {
      const r = document.createRange();
      r.selectNodeContents(el);
      return r.getBoundingClientRect().right;
    });
    const plLeft = (await pl.boundingBox())!.x;
    expect(heroRight).toBeLessThanOrEqual(plLeft);
  },
);

Then(
  /^the "(.+?)" chart waits for a finished month$/,
  async ({ page }, testId: string) => {
    await expect(page.getByTestId(testId)).toBeVisible();
  },
);

Then(
  /^the "(.+?)" chart does not wait for a finished month$/,
  async ({ page }, testId: string) => {
    // Both bodies open first, so absence is measured on a rendered section.
    await expect(
      page.getByTestId("overview-section-planned-body"),
    ).toBeVisible();
    await expect(
      page.getByTestId("overview-section-reserves-body"),
    ).toBeVisible();
    await expect(page.getByTestId(testId)).toHaveCount(0);
  },
);

// 261102 (user): the wealth chart owns the pointer (@r8-chart-scrub).
async function chartBox(po: OverviewPo) {
  await po.wealthChart().scrollIntoViewIfNeeded();
  // A scroll closes the tooltip (on purpose), and a smooth scroll lands its
  // last events after the pointer has moved — wait until the chart is still.
  let last = "";
  await expect
    .poll(async () => {
      const now = JSON.stringify(await po.wealthChart().boundingBox());
      const still = now === last;
      last = now;
      return still;
    })
    .toBe(true);
  const b = await po.wealthChart().boundingBox();
  if (!b) throw new Error("wealth chart not laid out");
  return b;
}

Then(
  "the wealth tooltip sits outside the chart and follows the pointer",
  async ({ page }) => {
    const po = new OverviewPo(page);
    const b = await chartBox(po);
    const lefts = new Set<number>();
    for (const f of [0.05, 0.5, 0.95]) {
      await page.mouse.move(b.x + b.width * f, b.y + b.height / 2);
      await expect(po.wealthTooltip()).toBeVisible();
      const tip = (await po.wealthTooltip().boundingBox())!;
      // 261103 (user): over the chart it hid the very line it described.
      const clear =
        tip.y + tip.height <= b.y + 1 || tip.y >= b.y + b.height - 1;
      expect(clear, `tooltip clear of the chart at ${f}`).toBe(true);
      // ...and not slid under the sticky range bar either.
      const onTop = await po.wealthTooltip().evaluate((el) => {
        const r = el.getBoundingClientRect();
        return el.contains(
          document.elementFromPoint(r.left + r.width / 2, r.top + 4),
        );
      });
      expect(onTop, `tooltip top uncovered at ${f}`).toBe(true);
      lefts.add(Math.round(tip.x));
    }
    expect(lefts.size, "the tooltip follows the pointer").toBeGreaterThan(1);
  },
);

Then(
  "the wealth tooltip stays while a pressed pointer slides past the chart",
  async ({ page }) => {
    const po = new OverviewPo(page);
    const b = await chartBox(po);
    await page.mouse.move(b.x + b.width * 0.3, b.y + b.height / 2);
    await expect(po.wealthTooltip()).toBeVisible();
    await page.mouse.down();
    await page.mouse.move(b.x + b.width * 0.6, b.y + b.height + 80, {
      steps: 4,
    });
    await expect(po.wealthTooltip().or(po.wealthRangeTooltip())).toBeVisible();
    await page.mouse.up();
    await page.mouse.move(0, 0);
    await expect(po.wealthTooltip()).toBeHidden();
  },
);

Then(
  "dragging across the wealth chart shows the change across the range",
  async ({ page }) => {
    const po = new OverviewPo(page);
    const b = await chartBox(po);
    const y = b.y + b.height / 2;
    await page.mouse.move(b.x + b.width * 0.1, y);
    await page.mouse.down();
    await page.mouse.move(b.x + b.width * 0.9, y, { steps: 6 });
    await expect(po.wealthRangeTooltip()).toBeVisible();
    await expect(
      po.wealthRangeTooltip().getByTestId("tooltip-title"),
    ).toContainText("–");
    await page.mouse.up();
    await expect(po.wealthRangeTooltip()).toBeHidden();
  },
);

type Touch = { x: number; y: number; id: number };
async function fingers(page: Page) {
  const po = new OverviewPo(page);
  const b = await chartBox(po);
  const y = b.y + b.height / 2;
  const cdp = await page.context().newCDPSession(page);
  const send = (type: string, touchPoints: Touch[]) =>
    cdp.send("Input.dispatchTouchEvent", { type, touchPoints });
  const at = (fa: number, fb: number, dy = 0): Touch[] => [
    { x: b.x + b.width * fa, y: y + dy, id: 1 },
    { x: b.x + b.width * fb, y: y + dy, id: 2 },
  ];
  const tap = async (p: { x: number; y: number }) => {
    await send("touchStart", [{ ...p, id: 9 }]);
    await send("touchEnd", []);
  };
  /** Two fingers down, spread, then (optionally) lifted. */
  const pinch = async (lift = true) => {
    await send("touchStart", at(0.2, 0.8));
    await send("touchMove", at(0.15, 0.85));
    await expect(po.wealthRangeTooltip()).toBeVisible();
    if (lift) await send("touchEnd", []);
  };
  return { po, b, y, send, at, tap, pinch };
}

Then(
  "two fingers on the wealth chart show the change between them",
  async ({ page }) => {
    const { po, send, at, pinch } = await fingers(page);
    await pinch(false);
    // Both fingers drifting down the chart is still the range, not a scroll.
    await send("touchMove", at(0.15, 0.85, 20));
    await send("touchMove", at(0.15, 0.85, 40));
    await expect(po.wealthRangeTooltip()).toBeVisible();
    await send("touchEnd", []);
  },
);

Then("a touch on the tooltip mid-gesture keeps the range", async ({ page }) => {
  const { po, send, at, b } = await fingers(page);
  // The range from the step before may still be up — clear it first.
  if (await po.wealthRangeTooltip().isVisible()) {
    await send("touchStart", [{ x: b.x + 4, y: b.y + 4, id: 9 }]);
    await send("touchEnd", []);
  }
  await send("touchStart", at(0.2, 0.8));
  await send("touchMove", at(0.15, 0.85));
  const tip = (await po.wealthRangeTooltip().boundingBox())!;
  const third = { x: tip.x + tip.width / 2, y: tip.y + tip.height / 2, id: 3 };
  await send("touchStart", [...at(0.15, 0.85), third]);
  await send("touchEnd", at(0.15, 0.85));
  await expect(po.wealthRangeTooltip()).toBeVisible();
  await send("touchEnd", []);
});

Then(
  "the range stays after the fingers lift until the tooltip is tapped",
  async ({ page }) => {
    const { po, tap } = await fingers(page);
    await expect(po.wealthRangeTooltip()).toBeVisible();
    await expect(po.wealthRange()).toHaveCount(1);
    const tip = (await po.wealthRangeTooltip().boundingBox())!;
    await tap({ x: tip.x + tip.width / 2, y: tip.y + tip.height / 2 });
    await expect(po.wealthRangeTooltip()).toBeHidden();
    await expect(po.wealthRange()).toHaveCount(0);
  },
);

Then(
  "the range stays after the fingers lift until the chart is tapped",
  async ({ page }) => {
    const { po, b, y, tap, pinch } = await fingers(page);
    await pinch();
    await expect(po.wealthRangeTooltip()).toBeVisible();
    await tap({ x: b.x + b.width * 0.5, y });
    await expect(po.wealthRangeTooltip()).toBeHidden();
    await expect(po.wealthRange()).toHaveCount(0);
    await expect(po.wealthTooltip()).toBeHidden();
  },
);

Then(
  "one finger sliding across the chart with a slight wobble keeps the tooltip",
  async ({ page }) => {
    const { po, b, y, send } = await fingers(page);
    await page.evaluate(() => {
      const w = window as unknown as { __scrolls: number };
      w.__scrolls = 0;
      window.addEventListener("scroll", () => w.__scrolls++, true);
    });
    // A thumb never moves dead level: a little vertical drift on the way.
    await send("touchStart", [{ x: b.x + b.width * 0.1, y, id: 1 }]);
    for (let i = 1; i <= 16; i++)
      await send("touchMove", [
        { x: b.x + b.width * (0.1 + i * 0.05), y: y + i * 2, id: 1 },
      ]);
    await expect(po.wealthTooltip()).toBeVisible();
    const scrolls = await page.evaluate(
      () => (window as unknown as { __scrolls: number }).__scrolls,
    );
    expect(scrolls, "the page stays put while the finger scrubs").toBe(0);
    await send("touchEnd", []);
  },
);

Then(
  "a tap on the tooltip does not reach what is behind it",
  async ({ page }) => {
    const { po, tap, pinch } = await fingers(page);
    await pinch();
    const tip = (await po.wealthRangeTooltip().boundingBox())!;
    await page.evaluate(() => {
      const w = window as unknown as { __clicks: string[] };
      w.__clicks = [];
      window.addEventListener(
        "click",
        (e) =>
          w.__clicks.push(
            (e.target as Element).closest('[data-testid$="tooltip"]')
              ? "tooltip"
              : (e.target as Element).outerHTML.slice(0, 80),
          ),
        true,
      );
    });
    await tap({ x: tip.x + tip.width / 2, y: tip.y + tip.height / 2 });
    await expect(po.wealthRangeTooltip()).toBeHidden();
    const clicks = await page.evaluate(
      () => (window as unknown as { __clicks: string[] }).__clicks,
    );
    expect(clicks.filter((c) => c !== "tooltip")).toEqual([]);
  },
);

// 261112 (user): a reveal lasts until a manual hide or the app is closed —
// another page keeps it.
When("I go to the budgets list and back", async ({ page }) => {
  const back = page.url();
  await page.getByRole("link", { name: "Budget", exact: true }).click();
  await page.waitForURL((u) => u.toString() !== back, { timeout: 10000 });
  await page.goBack();
  await page.waitForURL(back, { timeout: 10000 });
});

When("I tap an overview amount", async ({ page }) => {
  await new OverviewPo(page).firstAmount().click();
});

Then(
  /^the overview amounts are (revealed|hidden)$/,
  async ({ page }, state: string) => {
    await expect(new OverviewPo(page).firstAmount()).toHaveAttribute(
      "data-revealed",
      state === "revealed" ? "true" : "false",
      { timeout: 10000 },
    );
  },
);
