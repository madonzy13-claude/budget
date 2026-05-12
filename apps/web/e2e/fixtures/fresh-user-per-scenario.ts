import { test as base } from "playwright-bdd";

// Phase 3 Wave 0 baseline: this fixture is a SKELETON for the per-scenario fresh-user contract.
// Plan 03-07 replaces this with the actual Better Auth signup + cookie copy implementation.
export const test = base.extend<{
  freshUser: { email: string; password: string; userId: string };
}>({
  freshUser: async ({ page: _page }, use) => {
    const email = `phase3-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.local`;
    const password = "Test1234!Phase3";
    // Plan 03-07 will wire actual signup via auth.api.signUpEmail() and copy the session cookie
    // into the Playwright browser context.
    const userId = "pending-implementation";
    await use({ email, password, userId });
  },
});

export { expect } from "@playwright/test";
