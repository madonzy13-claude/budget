import { createBdd } from "playwright-bdd";
import { expect } from "@playwright/test";
import { test } from "../fixtures/fresh-user-per-scenario";
const { Given, When, Then } = createBdd(test);

// Mint a SECOND server-side session for the same user (a fresh sign-in creates a
// new session row). We discard the returned cookies — the browser context keeps
// its original (current) session; the new row just makes listSessions return >1
// so the "sign out all other devices" control appears.
Given("I have a second active session", async ({ freshUser, baseURL }) => {
  const base =
    baseURL ?? process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
  const res = await fetch(`${base}/auth/sign-in/email`, {
    method: "POST",
    headers: { "content-type": "application/json", Origin: base },
    body: JSON.stringify({
      email: freshUser.email,
      password: freshUser.password,
    }),
  });
  if (!res.ok) {
    throw new Error(
      `second sign-in failed (${res.status}): ${await res.text().catch(() => "")}`,
    );
  }
});

// Open /settings and expand the (default-closed) Security accordion item.
When("I open the Security section", async ({ page }) => {
  await page.goto("/en/settings");
  await page
    .waitForLoadState("networkidle", { timeout: 10000 })
    .catch(() => {});
  await page.getByRole("button", { name: "Security" }).click();
  await page
    .getByTestId("change-password-button")
    .waitFor({ state: "visible", timeout: 10000 });
});

When("I click change password", async ({ page }) => {
  await page.getByTestId("change-password-button").click();
});

Then("I see the sign-out-others control", async ({ page }) => {
  await page
    .getByTestId("sign-out-others")
    .waitFor({ state: "visible", timeout: 10000 });
});

When("I sign out all other devices", async ({ page }) => {
  await page.getByTestId("sign-out-others").click();
  await page.getByRole("alertdialog").waitFor({ state: "visible" });
  await page.getByTestId("confirm-action").click();
});

Then("the sign-out-others control is gone", async ({ page }) => {
  await expect(page.getByTestId("sign-out-others")).toHaveCount(0);
});
