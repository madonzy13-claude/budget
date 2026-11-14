import { createBdd } from "playwright-bdd";
import { test } from "../fixtures/fresh-user-per-scenario";
import { CategorySliderPo } from "../page-objects/CategorySliderPo";

const { When, Then } = createBdd(test);

When("I add a category {string} without touching its currency", async ({ page }, name: string) => {
  const slider = new CategorySliderPo(page);
  await slider.openAdd();
  await slider.setName(name);
  await slider.save();
});

When("I open the edit slider for {string}", async ({ page }, name: string) => {
  await new CategorySliderPo(page).openEdit(name);
});

When("I change the category currency to {string}", async ({ page }, ccy: string) => {
  await new CategorySliderPo(page).setCurrency(ccy);
});

When("I close the category slider", async ({ page }) => {
  await page.keyboard.press("Escape");
  await page.getByTestId("cat-slider-content").waitFor({ state: "hidden", timeout: 10000 });
});

When("I save the category", async ({ page }) => {
  await new CategorySliderPo(page).save();
});

Then("the category currency reads {string}", async ({ page }, ccy: string) => {
  await new CategorySliderPo(page).assertCurrency(ccy);
});

// No hint line any more (owner, 261104) — the converted limit shows itself.
Then("the converted limit is shown in {string}", async ({ page }, sign: string) => {
  const slider = new CategorySliderPo(page);
  await slider.assertNoHint();
  await slider.assertPreview(sign);
});
