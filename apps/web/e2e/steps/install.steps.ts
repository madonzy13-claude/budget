import { createBdd } from "playwright-bdd";
import { test } from "../fixtures/fresh-user-per-scenario";
import { InstallPo } from "../page-objects/InstallPo";

const { Given, When, Then } = createBdd(test);

Given("I installed the app before and removed it", async ({ page }) => {
  await new InstallPo(page).leftoverInstalledFlag();
});

When("Chrome offers to install the app", async ({ page }) => {
  await new InstallPo(page).chromeOffersInstall();
});

Then("I am offered to install the app", async ({ page }) => {
  await new InstallPo(page).expectBannerOffered();
});
