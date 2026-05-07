import { expect, request } from "@playwright/test";
import { createBdd } from "playwright-bdd";
import { test } from "../fixtures/index.js";
import { SignUpPage } from "../pages/SignUpPage.js";
import { SignInPage } from "../pages/SignInPage.js";
import { AppShellPage } from "../pages/AppShellPage.js";
import { LOCALE_LABELS, type Locale } from "../pages/labels.js";
import { createFreshUser } from "../fixtures/freshUser.js";
import {
  pollMailpitForRecipient,
  fetchMessageBody,
  fetchVerifyUrl,
  rewriteVerifyUrlToBaseHost,
} from "../fixtures/mailpit.js";

const { Given, When, Then } = createBdd(test);

// ── Locale parameter type ─────────────────────────────────────────────────────

function asLocale(s: string): Locale {
  if (s === "en" || s === "pl" || s === "uk") return s;
  throw new Error(`Unknown locale: ${s}`);
}

// ── Given steps ──────────────────────────────────────────────────────────────

Given(
  "I am on the {string} sign-up page",
  async ({ page }, localeStr: string) => {
    const locale = asLocale(localeStr);
    const signUpPage = new SignUpPage(page, locale);
    await signUpPage.goto();
  },
);

Given(
  "I am on the {string} sign-in page",
  async ({ page }, localeStr: string) => {
    const locale = asLocale(localeStr);
    const signInPage = new SignInPage(page, locale);
    await signInPage.goto();
  },
);

Given(
  "a fresh verified user in {string}",
  async ({ page, scenarioCtx }, localeStr: string) => {
    const locale = asLocale(localeStr);
    const user = await createFreshUser(page, locale);
    scenarioCtx.freshUser = user;
  },
);

// ── When steps ────────────────────────────────────────────────────────────────

When(
  "I submit the sign-up form with name {string}, a unique email, password {string}",
  async ({ page, scenarioCtx }, name: string, password: string) => {
    const email = `e2e-signup+${Date.now()}@example.com`;
    scenarioCtx.lastSignUpEmail = email;
    const locale: Locale = "en"; // This step is only used in en scenarios
    const signUpPage = new SignUpPage(page, locale);
    await signUpPage.fill({ name, email, password });
    await signUpPage.submit();
  },
);

When(
  "I submit the sign-in form with a nonexistent email and password {string}",
  async ({ page }, password: string) => {
    // Determine locale from current URL
    const url = page.url();
    const localeMatch = url.match(/\/(en|pl|uk)\//);
    const locale = asLocale(localeMatch?.[1] ?? "en");
    const signInPage = new SignInPage(page, locale);
    await signInPage.fill({
      email: `nonexistent-${Date.now()}@example.com`,
      password,
    });
    await signInPage.submit();
  },
);

When(
  "I submit the sign-in form with email {string} and password {string}",
  async ({ page }, email: string, password: string) => {
    const url = page.url();
    const localeMatch = url.match(/\/(en|pl|uk)\//);
    const locale = asLocale(localeMatch?.[1] ?? "en");
    const signInPage = new SignInPage(page, locale);
    await signInPage.fill({ email, password });
    await signInPage.submit();
  },
);

When(
  "I submit the sign-in form with the fresh email and password {string}",
  async ({ page, scenarioCtx }, password: string) => {
    const url = page.url();
    const localeMatch = url.match(/\/(en|pl|uk)\//);
    const locale = asLocale(localeMatch?.[1] ?? "en");
    const signInPage = new SignInPage(page, locale);
    if (!scenarioCtx.lastSignUpEmail)
      throw new Error("No lastSignUpEmail in scenario context");
    await signInPage.fill({ email: scenarioCtx.lastSignUpEmail, password });
    await signInPage.submit();
  },
);

When(
  "I trigger empty-form validation on the sign-up form",
  async ({ page }) => {
    const url = page.url();
    const localeMatch = url.match(/\/(en|pl|uk)\//);
    const locale = asLocale(localeMatch?.[1] ?? "en");
    const signUpPage = new SignUpPage(page, locale);
    await signUpPage.triggerEmptyValidation();
  },
);

When("I click the sign-out button", async ({ page }) => {
  const shell = new AppShellPage(page);
  await shell.clickSignOut();
});

When(
  "I sign in with the fresh user's credentials in {string}",
  async ({ page, scenarioCtx }, localeStr: string) => {
    const locale = asLocale(localeStr);
    const user = scenarioCtx.freshUser;
    if (!user) throw new Error("No freshUser in scenario context");
    const signInPage = new SignInPage(page, locale);
    await signInPage.goto();
    await signInPage.fill({ email: user.email, password: user.password });
    await signInPage.submit();
  },
);

// Sign-up steps for duplicate and verify scenarios

When(
  "I sign up with a fresh email name {string} password {string} in {string}",
  async (
    { page, scenarioCtx },
    name: string,
    password: string,
    localeStr: string,
  ) => {
    const locale = asLocale(localeStr);
    const email = `e2e-dup+${Date.now()}@example.com`;
    scenarioCtx.lastSignUpEmail = email;
    const signUpPage = new SignUpPage(page, locale);
    await signUpPage.fill({ name, email, password });
    await signUpPage.submit();
  },
);

When(
  "I sign up with the same email name {string} password {string} in {string}",
  async (
    { page, scenarioCtx },
    name: string,
    password: string,
    localeStr: string,
  ) => {
    const locale = asLocale(localeStr);
    if (!scenarioCtx.lastSignUpEmail)
      throw new Error("No lastSignUpEmail in scenario context");
    const signUpPage = new SignUpPage(page, locale);
    await signUpPage.fill({
      name,
      email: scenarioCtx.lastSignUpEmail,
      password,
    });
    await signUpPage.submit();
  },
);

When(
  "I sign up with the same email uppercased name {string} password {string} in {string}",
  async (
    { page, scenarioCtx },
    name: string,
    password: string,
    localeStr: string,
  ) => {
    const locale = asLocale(localeStr);
    if (!scenarioCtx.lastSignUpEmail)
      throw new Error("No lastSignUpEmail in scenario context");
    const signUpPage = new SignUpPage(page, locale);
    await signUpPage.fill({
      name,
      email: scenarioCtx.lastSignUpEmail.toUpperCase(),
      password,
    });
    await signUpPage.submit();
  },
);

When(
  "I post to the sign-in email endpoint with the original email and password {string}",
  async ({ page, scenarioCtx }, password: string) => {
    const baseUrl = new URL(page.url());
    const origin = `${baseUrl.protocol}//${baseUrl.host}`;
    if (!scenarioCtx.lastSignUpEmail)
      throw new Error("No lastSignUpEmail in scenario context");
    const api = await request.newContext();
    try {
      const res = await api.post(`${origin}/api/auth/sign-in/email`, {
        headers: { "Content-Type": "application/json", Origin: origin },
        data: { email: scenarioCtx.lastSignUpEmail, password },
      });
      (scenarioCtx as Record<string, unknown>)["lastApiStatus"] = res.status();
      (scenarioCtx as Record<string, unknown>)["lastApiBody"] =
        await res.text();
    } finally {
      await api.dispose();
    }
  },
);

When(
  "I open the verification link from the latest Mailpit message",
  async ({ page, scenarioCtx }) => {
    const email = scenarioCtx.lastSignUpEmail;
    if (!email) throw new Error("No lastSignUpEmail in scenario context");
    const api = await request.newContext();
    try {
      const message = await pollMailpitForRecipient(api, email);
      const remoteVerifyUrl = await fetchVerifyUrl(api, message.ID);
      const verifyUrl = rewriteVerifyUrlToBaseHost(remoteVerifyUrl, page.url());
      await page.goto(verifyUrl);
    } finally {
      await api.dispose();
    }
  },
);

// ── Then steps ────────────────────────────────────────────────────────────────

Then(
  "I am redirected to a sign-in page with verify-pending",
  async ({ page }) => {
    await expect(page).toHaveURL(/\/(en|pl|uk)\/sign-in\?verify=pending/, {
      timeout: 10000,
    });
  },
);

Then("the verify-pending banner is visible", async ({ page }) => {
  await expect(page.getByTestId("verify-pending-banner")).toBeVisible();
});

Then(
  "I see the {string} invalid-credentials error",
  async ({ page }, localeStr: string) => {
    const locale = asLocale(localeStr);
    const signInPage = new SignInPage(page, locale);
    await signInPage.expectInvalidCredentialsError();
  },
);

Then(
  "I see the {string} name-required error",
  async ({ page }, localeStr: string) => {
    const locale = asLocale(localeStr);
    const signUpPage = new SignUpPage(page, locale);
    await signUpPage.expectNameRequiredError();
  },
);

Then(
  "I see the {string} email-not-verified error",
  async ({ page }, localeStr: string) => {
    const locale = asLocale(localeStr);
    const signInPage = new SignInPage(page, locale);
    await signInPage.expectEmailNotVerifiedError();
  },
);

Then("the sign-out button is visible", async ({ page }) => {
  const shell = new AppShellPage(page);
  await shell.expectSignOutButtonVisible();
});

Then("the sign-out button is hidden", async ({ page }) => {
  const shell = new AppShellPage(page);
  await shell.expectSignOutButtonAbsent();
});

Then("the get-session API returns null", async ({ page }) => {
  const session = await page.evaluate(async () => {
    const res = await fetch("/api/auth/get-session", {
      credentials: "include",
    });
    return { status: res.status, body: (await res.text()).trim() };
  });
  expect(session.status).toBe(200);
  expect(session.body).toBe("null");
});

Then("the better-auth session cookie is absent", async ({ context }) => {
  const cookies = await context.cookies();
  const session = cookies.find((c) => c.name === "better-auth.session_token");
  expect(session).toBeUndefined();
});

Then(
  "the email-address input has placeholder {string}",
  async ({ page }, placeholder: string) => {
    // Determine locale from current URL
    const url = page.url();
    const localeMatch = url.match(/\/(en|pl|uk)\//);
    const locale = asLocale(localeMatch?.[1] ?? "en");
    const labels = LOCALE_LABELS[locale];
    const input = page.getByLabel(labels.signUp.email);
    await expect(input).toHaveAttribute("placeholder", placeholder);
  },
);

Then("the sign-up form fields are visible", async ({ page }) => {
  const signUpPage = new SignUpPage(page, "en");
  await signUpPage.expectAllFieldsVisible();
});

Then("I am NOT on a sign-in page", async ({ page }) => {
  await expect(page).not.toHaveURL(/\/sign-in/, { timeout: 10000 });
});

Then("the email-not-verified error is not visible", async ({ page }) => {
  const signInPage = new SignInPage(page, "en");
  await signInPage.expectEmailNotVerifiedErrorAbsent();
});

// API response assertions (for duplicate-signup)
Then(
  "the API response status is {int}",
  async ({ scenarioCtx }, statusCode: number) => {
    const actual = (scenarioCtx as Record<string, unknown>)["lastApiStatus"] as
      | number
      | undefined;
    expect(actual).toBe(statusCode);
  },
);

Then(
  "the API response body contains {string}",
  async ({ scenarioCtx }, expectedText: string) => {
    const body = (scenarioCtx as Record<string, unknown>)["lastApiBody"] as
      | string
      | undefined;
    expect(body).toContain(expectedText);
  },
);

// Mailpit-based steps
Then(
  "a Mailpit message is delivered to that email",
  async ({ scenarioCtx }) => {
    const email = scenarioCtx.lastSignUpEmail;
    if (!email) throw new Error("No lastSignUpEmail in scenario context");
    const api = await request.newContext();
    try {
      const message = await pollMailpitForRecipient(api, email);
      (scenarioCtx as Record<string, unknown>)["lastMailpitMessage"] = message;
    } finally {
      await api.dispose();
    }
  },
);

Then(
  "the Mailpit message subject matches the {string} verify-subject",
  async ({ scenarioCtx }, localeStr: string) => {
    const locale = asLocale(localeStr);
    const labels = LOCALE_LABELS[locale];
    const msg = (scenarioCtx as Record<string, unknown>)[
      "lastMailpitMessage"
    ] as { Subject: string } | undefined;
    if (!msg) throw new Error("No Mailpit message in scenario context");
    expect(msg.Subject).toMatch(labels.verifyEmailSubject);
  },
);

Then(
  "the Mailpit message body contains a verify-email URL",
  async ({ scenarioCtx }) => {
    const msg = (scenarioCtx as Record<string, unknown>)[
      "lastMailpitMessage"
    ] as { ID: string } | undefined;
    if (!msg) throw new Error("No Mailpit message in scenario context");
    const api = await request.newContext();
    try {
      const body = await fetchMessageBody(api, msg.ID);
      expect(body.Text).toMatch(/auth\/verify-email\?token=/);
    } finally {
      await api.dispose();
    }
  },
);
