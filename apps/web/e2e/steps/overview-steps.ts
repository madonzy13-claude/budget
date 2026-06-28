import { expect } from "@playwright/test";
import { createBdd } from "playwright-bdd";
import { test } from "../fixtures/fresh-user-per-scenario";
import { BdpPo } from "../page-objects/BdpPo";

const { Then } = createBdd(test);

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
