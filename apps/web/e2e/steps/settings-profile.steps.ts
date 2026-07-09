import { createBdd } from "playwright-bdd";
import { test } from "../fixtures/fresh-user-per-scenario";
const { When, Then } = createBdd(test);

// USET-04 — the Profile section of the single settings accordion. General is the
// default-open section, so expand Profile to surface its fields.
When("I open the User settings page", async ({ page }) => {
  await page.goto("/en/settings");
  await page
    .waitForLoadState("networkidle", { timeout: 10000 })
    .catch(() => {});
  // exact:true — "Profile" would otherwise also match the header "Open profile menu".
  await page.getByRole("button", { name: "Profile", exact: true }).click();
  await page
    .getByTestId("profile-name-input")
    .waitFor({ state: "visible", timeout: 10000 });
});

When("I set the profile name to {string}", async ({ page }, name: string) => {
  await page.getByTestId("profile-name-input").fill(name);
  await page.getByTestId("profile-name-save").click();
});

When(
  "I request an email change to {string}",
  async ({ page }, email: string) => {
    await page.getByTestId("profile-email-input").fill(email);
    await page.getByTestId("profile-email-save").click();
  },
);

// sonner renders the toast title as text inside the (app)-layout Toaster. Match
// on a substring so we are robust to the trailing helper copy.
Then("I see the settings notice {string}", async ({ page }, text: string) => {
  await page
    .getByText(text, { exact: false })
    .first()
    .waitFor({ state: "visible", timeout: 10000 });
});
