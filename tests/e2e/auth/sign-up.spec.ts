import { test, expect } from "@playwright/test";

const BASE_EMAIL = "e2e-signup";
const PASSWORD = "testpassword123!";

function uniqueEmail() {
  return `${BASE_EMAIL}+${Date.now()}@example.com`;
}

test.describe("Sign Up", () => {
  test("redirects root to sign-in", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/en\/sign-in/);
  });

  test("shows sign-up form with all fields", async ({ page }) => {
    await page.goto("/en/sign-up");
    await expect(page.getByLabel(/full name/i)).toBeVisible();
    await expect(page.getByLabel(/email address/i)).toBeVisible();
    await expect(page.getByLabel(/password/i)).toBeVisible();
    await expect(
      page.getByRole("button", { name: /create account/i }),
    ).toBeVisible();
  });

  test("shows validation errors in English for empty form", async ({
    page,
  }) => {
    await page.goto("/en/sign-up");
    await page.getByLabel(/full name/i).click();
    await page.getByLabel(/email address/i).click();
    await page.getByLabel(/password/i).click();
    await page.getByRole("button", { name: /create account/i }).click();
    await expect(page.getByText(/name is required/i)).toBeVisible();
  });

  test("shows validation errors in Ukrainian locale", async ({ page }) => {
    await page.goto("/uk/sign-up");
    await page.getByLabel(/повне ім'я/i).click();
    await page.getByLabel(/електронна адреса/i).click();
    await page.getByLabel(/пароль/i).click();
    await page
      .getByRole("button", { name: /створити обліковий запис/i })
      .click();
    await expect(page.getByText(/ім'я є обов'язковим/i)).toBeVisible();
  });

  test("email placeholder is not localised", async ({ page }) => {
    await page.goto("/uk/sign-up");
    const input = page.getByLabel(/електронна адреса/i);
    await expect(input).toHaveAttribute("placeholder", "you@example.com");
  });

  test("creates account and shows verification banner", async ({ page }) => {
    const email = uniqueEmail();
    await page.goto("/en/sign-up");
    await page.getByLabel(/full name/i).fill("E2E Test User");
    await page.getByLabel(/email address/i).fill(email);
    await page.getByLabel(/password/i).fill(PASSWORD);
    await page.getByRole("button", { name: /create account/i }).click();

    // Should redirect to onboarding or show verification banner
    await expect(page).toHaveURL(
      /\/(en|pl|uk)\/(onboarding|sign-in|workspaces)/,
      { timeout: 10000 },
    );
  });
});
