import { expect, type Page } from "@playwright/test";
import { createBdd } from "playwright-bdd";
import { test } from "../fixtures/fresh-user-per-scenario";
import { AppUpdatePo } from "../page-objects/AppUpdatePo";

const { Given, When, Then } = createBdd(test);

// One page object per page: it counts the page's loads from the start.
const pos = new WeakMap<Page, AppUpdatePo>();
const poFor = (page: Page) => {
  if (!pos.has(page)) pos.set(page, new AppUpdatePo(page));
  return pos.get(page)!;
};

Given("the app runs without its offline worker", async ({ page }) => {
  await poFor(page).withoutServiceWorker();
});

Given("the server runs a newer build", async ({ page }) => {
  await poFor(page).serverRunsNewerBuild();
});

Given("an update has just been installed", async ({ page }) => {
  await poFor(page).justUpdatedToTheRunningBuild();
});

When("I open the user settings", async ({ page }) => {
  await poFor(page).openSettings();
});

When("I tap Update now", async ({ page }) => {
  await poFor(page).updateNowButton.click();
});

Then("the app reloads itself {int} times and then stays put", async ({ page }, n: number) => {
  expect(await poFor(page).settledLoads()).toBe(n);
});

Then("settings say I have the latest version", async ({ page }) => {
  await poFor(page).expectLatest();
});

Then("settings offer Update now", async ({ page }) => {
  await poFor(page).expectStale();
});

Then("I see that the newest version was installed", async ({ page }) => {
  await poFor(page).expectUpdatedBanner();
});
