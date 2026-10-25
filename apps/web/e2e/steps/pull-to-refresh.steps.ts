import { createBdd } from "playwright-bdd";
import { test } from "../fixtures/fresh-user-per-scenario";
import { PullToRefreshPo } from "../page-objects/PullToRefreshPo";

const { Given, When, Then } = createBdd(test);

Given("I use the installed app", async ({ page }) => {
  await new PullToRefreshPo(page).installAsApp();
});

When("I scroll the page down", async ({ page }) => {
  await new PullToRefreshPo(page).scrollPageDown();
});

When("I pull down from the header", async ({ page }) => {
  await new PullToRefreshPo(page).pullFromHeaderWithoutRelease();
});

Then("the refresh indicator appears", async ({ page }) => {
  await new PullToRefreshPo(page).expectIndicatorShown();
});
