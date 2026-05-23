import { test as base } from "playwright-bdd";
import { request, expect } from "@playwright/test";
import { SignUpPage } from "../pages/SignUpPage.js";
import { type Locale } from "../pages/labels.js";
import {
  pollMailpitForRecipient,
  fetchVerifyUrl,
  rewriteVerifyUrlToBaseHost,
} from "./mailpit.js";

export interface FreshUser {
  email: string;
  password: string;
  name: string;
  locale: Locale;
}

/** Per-test scenario state shared across steps (email generated during the test). */
export interface ScenarioCtx {
  freshUser: FreshUser | undefined;
  /** Last email used in a sign-up step (for duplicate-signup assertions). */
  lastSignUpEmail: string | undefined;
}

type CustomFixtures = {
  /** A brand-new, fully verified user ready to use in authenticated scenarios. */
  freshUser: FreshUser;
  /** Mutable scenario-scoped state for passing data between steps. */
  scenarioCtx: ScenarioCtx;
};

export const test = base.extend<CustomFixtures>({
  scenarioCtx: async ({}, use) => {
    await use({ freshUser: undefined, lastSignUpEmail: undefined });
  },

  freshUser: async ({ page, scenarioCtx }, use) => {
    const locale: Locale = "en";
    const user = await createFreshUser(page, locale);
    scenarioCtx.freshUser = user;
    await use(user);
  },
});

export { expect };

/**
 * Creates a new unique user, signs them up, and fully verifies their email.
 * Returns credentials for use in authenticated test scenarios.
 */
export async function createFreshUser(
  page: import("@playwright/test").Page,
  locale: Locale,
): Promise<FreshUser> {
  const email = `e2e-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
  const password = "testpassword123!";
  const name = "E2E User";

  const signUpPage = new SignUpPage(page, locale);
  // Phase 6 share-link scenarios call createFreshUser twice in one scenario
  // (owner + recipient). The recipient's call would otherwise inherit the
  // owner's session cookie and `/sign-up` would redirect to home, hiding the
  // name field. Drop cookies + storage so every fresh user starts unauthed.
  await page.context().clearCookies();
  try {
    await page.evaluate(() => {
      try {
        localStorage.clear();
        sessionStorage.clear();
      } catch {
        /* storage may not be available before first navigation */
      }
    });
  } catch {
    /* page may not yet have a document — first call only */
  }
  await signUpPage.goto();
  await signUpPage.fill({ name, email, password });
  await signUpPage.submit();
  await expect(page).toHaveURL(/\/(en|pl|uk)\/sign-in\?verify=pending/, {
    timeout: 10000,
  });

  const api = await request.newContext();
  try {
    const message = await pollMailpitForRecipient(api, email);
    const remoteVerifyUrl = await fetchVerifyUrl(api, message.ID);
    const verifyUrl = rewriteVerifyUrlToBaseHost(remoteVerifyUrl, page.url());
    await page.goto(verifyUrl);
    await expect(page).not.toHaveURL(/\/sign-in/, { timeout: 10000 });
  } finally {
    await api.dispose();
  }

  return { email, password, name, locale };
}
