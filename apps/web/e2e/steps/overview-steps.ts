import { expect } from "@playwright/test";
import { createBdd } from "playwright-bdd";
import { test } from "../fixtures/fresh-user-per-scenario";
import { BdpPo } from "../page-objects/BdpPo";
import {
  OverviewPo,
  type OverviewSectionSlug,
} from "../page-objects/OverviewPo";

const { When, Then } = createBdd(test);

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
