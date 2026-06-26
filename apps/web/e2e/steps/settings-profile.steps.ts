import { createBdd } from "playwright-bdd";
import { test } from "../fixtures/fresh-user-per-scenario";
const { When, Then } = createBdd(test);

// USET-04 — the User-pill Profile section. The accordion opens Profile by
// default, so navigating straight to /settings/user surfaces the fields.
When("I open the User settings page", async ({ page }) => {
  await page.goto("/en/settings/user");
  await page
    .waitForLoadState("networkidle", { timeout: 10000 })
    .catch(() => {});
  // Profile fields live in the default-open accordion item.
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
