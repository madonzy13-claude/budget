/**
 * bdp-shell-geometry.steps.ts — geometry guards for shell regressions.
 *
 * Regression 2 (quick-260612-a0c R2): tasks banner (pill-task-slider) must
 * never be occluded by the pinned [data-shell-header] in browser mode.
 *
 * Playwright (Chromium) emulates browser mode (not standalone). boundingBox()
 * gives us the rendered geometry without iOS-only caveats, so this is a solid
 * proof for R2. RESERVE_TOPUP maps to the *reserves* pill (kind-pill-map.ts),
 * so the geometry is measured against the reserves-pill banner on the
 * reserves tab — mirroring the working tasks.feature seeding pattern.
 */

import { createBdd } from "playwright-bdd";
import { expect } from "@playwright/test";
import { test } from "../fixtures/fresh-user-per-scenario";
import { BdpPo } from "../page-objects/BdpPo";

const { Given, Then } = createBdd(test);

// ---------------------------------------------------------------------------
// Given — bulk category seeding so the page has real scroll room.
// Mirrors reserves.steps.ts "category with a monthly limit" SQL (tenant-id
// GUC for RLS); inlined here because each steps file owns its seed helpers.
// ---------------------------------------------------------------------------

async function withTenantClient<T>(
  budgetId: string,
  fn: (client: import("pg").PoolClient) => Promise<T>,
): Promise<T> {
  const { Pool } = await import("pg");
  const dbUrl =
    process.env.DATABASE_URL_APP?.replace("@db:", "@localhost:") ?? "";
  if (!dbUrl) throw new Error("DATABASE_URL_APP not set — cannot seed");
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

Given(
  /^the budget has (\d+) seeded categories with monthly limits$/,
  async ({ freshUser }, count: string) => {
    const n = Number(count);
    await withTenantClient(freshUser.budgetId, async (client) => {
      const ccyRes = await client.query<{ default_currency: string }>(
        `SELECT default_currency FROM tenancy.budgets WHERE id = $1::uuid`,
        [freshUser.budgetId],
      );
      const ccy = (ccyRes.rows[0]?.default_currency ?? "USD").trim();
      for (let i = 0; i < n; i += 1) {
        const cat = await client.query<{ id: string }>(
          `INSERT INTO budgeting.categories (id, tenant_id, name, actor_user_id, sort_index)
           VALUES (gen_random_uuid(), $1::uuid, $2, $3::uuid, $4)
           RETURNING id`,
          [freshUser.budgetId, `Geometry Cat ${i + 1}`, freshUser.userId, i],
        );
        await client.query(
          `INSERT INTO budgeting.category_limits
             (id, tenant_id, category_id, normal_amount, normal_currency,
              cushion_amount, cushion_currency, effective_from, effective_to,
              actor_user_id)
           VALUES (gen_random_uuid(), $1::uuid, $2::uuid, $3, $4, $3, $4,
                   date_trunc('month', (now() AT TIME ZONE 'UTC')::date)::date,
                   NULL, $5::uuid)`,
          [freshUser.budgetId, cat.rows[0]!.id, 10000, ccy, freshUser.userId],
        );
      }
    });
  },
);

// ---------------------------------------------------------------------------
// Then — boundingBox geometry: banner top vs pinned header bottom.
// ---------------------------------------------------------------------------

/**
 * Assert that the tasks banner (pill-task-slider[data-pill="reserves"]) top
 * edge is at or below the pinned header bottom edge.
 * Tolerance: 1px (sub-pixel rounding).
 */
async function assertBannerBelowHeader(
  page: import("@playwright/test").Page,
  phase: string,
) {
  const bdp = new BdpPo(page);
  const header = bdp.shellHeader();
  const banner = bdp.tasksBanner("reserves");

  // Wait for banner to be visible before measuring
  await expect(banner).toBeVisible({ timeout: 10000 });

  const headerBox = await header.boundingBox();
  const bannerBox = await banner.boundingBox();

  if (!headerBox) throw new Error("shellHeader bounding box is null");
  if (!bannerBox) throw new Error("pill-task-slider bounding box is null");

  const headerBottom = headerBox.y + headerBox.height;
  const bannerTop = bannerBox.y;

  // Log geometry for SUMMARY proof artifact
  console.log(
    `[geometry:${phase}] header: y=${headerBox.y} h=${headerBox.height} bottom=${headerBottom}`,
  );
  console.log(
    `[geometry:${phase}] banner: y=${bannerTop} h=${bannerBox.height}`,
  );
  console.log(
    `[geometry:${phase}] viewport: ${page.viewportSize()?.width}x${page.viewportSize()?.height}`,
  );

  expect(
    bannerTop,
    `banner top (${bannerTop}) must be >= header bottom (${headerBottom}) — banner is occluded by header (${phase})`,
  ).toBeGreaterThanOrEqual(headerBottom - 1);
}

Then(
  "the tasks banner top edge is at or below the pinned header bottom edge at rest",
  async ({ page }) => {
    await assertBannerBelowHeader(page, "at-rest");
  },
);

Then(
  "the tasks banner top edge is at or below the pinned header bottom edge after scrolling down",
  async ({ page }) => {
    // Scroll down to trigger native page scroll (collapses iOS bottom bar in
    // browser mode; also exercises sticky positioning edge cases).
    await page.evaluate(() => window.scrollBy(0, 400));
    // Small settle wait for sticky recalculation
    await page.waitForTimeout(200);
    // Honesty guard: the page MUST have actually scrolled, otherwise a
    // too-short page would make this assertion pass vacuously.
    const scrollY = await page.evaluate(() => window.scrollY);
    console.log(`[geometry:after-scroll] window.scrollY=${scrollY}`);
    expect(
      scrollY,
      "page did not scroll — seed taller content, the occlusion repro needs real page scroll",
    ).toBeGreaterThan(50);
    await assertBannerBelowHeader(page, "after-scroll");
  },
);
