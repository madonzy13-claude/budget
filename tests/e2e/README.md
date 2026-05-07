# E2E Test Suite — playwright-bdd Gherkin

This test suite uses [playwright-bdd](https://github.com/vitalets/playwright-bdd) to run
BDD scenarios expressed as Gherkin `.feature` files with Playwright as the test runner.

## Folder Layout

```
tests/e2e/
├── features/          # Gherkin feature files (.feature)
│   ├── auth/          # Authentication-domain scenarios
│   └── currency/      # Currency picker scenarios
├── steps/             # Step definition files (*.steps.ts)
│   ├── auth.steps.ts  # Given/When/Then for auth flows
│   ├── navigation.steps.ts  # Generic navigation + redirect assertions
│   └── currency.steps.ts    # Currency picker steps
├── pages/             # Page Object classes
│   ├── labels.ts      # Single source of truth for all locale UI strings
│   ├── SignUpPage.ts
│   ├── SignInPage.ts
│   ├── OnboardingPage.ts
│   └── AppShellPage.ts
└── fixtures/          # Playwright fixtures
    ├── index.ts       # Re-exports test + expect for step files
    ├── freshUser.ts   # Per-scenario verified user fixture + ScenarioCtx
    └── mailpit.ts     # Mailpit API helpers (pollMailpit, fetchVerifyUrl, etc.)
```

## Running Tests

```bash
# Full suite against the running Docker stack (resolves APP_URL from .env.local)
make test-e2e

# Interactive UI mode for debugging
make test-e2e-ui

# Regenerate .features-gen/ after editing .feature files (Makefile does this automatically)
bunx bddgen
```

PLAYWRIGHT_BASE_URL is resolved automatically from `APP_URL` in `.env.local` by the Makefile.
Never hardcode `http://localhost:3000` — it will break on Tailscale or remote hosts.

## Adding a Feature

1. Create `tests/e2e/features/<domain>/<my-feature>.feature` with Gherkin scenarios.
2. Run `bunx bddgen` — it will report any step phrases that have no definition.
3. Add missing step definitions in the appropriate `tests/e2e/steps/*.steps.ts` file.
4. Run `make test-e2e` to confirm green.

## Step Definition Rules

- Import `test` and `expect` from `../fixtures/index.js` (not from `playwright-bdd` or `@playwright/test` directly).
- Use `createBdd(test)` to get `Given`, `When`, `Then`.
- Reuse step phrases across multiple feature files — playwright-bdd resolves by phrase, not by file.
- Never use bare `page.getByLabel(/.../)` in step bodies. Always delegate to a Page Object method.
- Step files are domain-partitioned: auth steps in `auth.steps.ts`, navigation in `navigation.steps.ts`, etc.

```typescript
import { createBdd } from "playwright-bdd";
import { test } from "../fixtures/index.js";
import { MyPage } from "../pages/MyPage.js";

const { Given, When, Then } = createBdd(test);

When("I do something on {string} page", async ({ page }, locale) => {
  const myPage = new MyPage(page, locale);
  await myPage.doSomething();
});
```

## Page Object Rules

- One class per page or major UI area.
- Constructor always accepts `(page: Page, locale: Locale)`.
- All selectors are derived from `LOCALE_LABELS[locale]` — never from bare regex literals inside the class.
- Expose named methods (`expectAllFieldsVisible()`, `triggerEmptyValidation()`) rather than raw locators in step code.

```typescript
import { LOCALE_LABELS, type Locale } from "./labels.js";

export class MyPage {
  constructor(
    private page: Page,
    private locale: Locale,
  ) {}

  async goto() {
    await this.page.goto(`/${this.locale}/my-page`);
  }

  someField() {
    return this.page.getByLabel(LOCALE_LABELS[this.locale].myField);
  }
}
```

## Fixture Rules

- Every authenticated scenario must use the `freshUser` fixture OR the `Given a fresh verified user in "<locale>"` step.
- Never call sign-up/sign-in logic directly from a step body — wrap it in the fixture or a page object.
- Scenario-scoped state between steps goes on `scenarioCtx` (provided by the `freshUser` fixture extension).
- The `freshUser` fixture creates a unique user per scenario, signs up, polls Mailpit, follows the verify link,
  and returns `{ email, password, name, locale }`.

## Locale Handling

- Prefer `Scenario Outline` + `Examples` over duplicate scenarios when the only difference is locale.
- Locale-specific UI strings (labels, placeholders, error messages, subjects) live **only** in `pages/labels.ts`.
- Feature files use locale tokens like `<locale>` in Outline examples — never bare translated strings.
- The `Locale` type is `"en" | "pl" | "uk"`.

## Mailpit

Mailpit listens at `MAILPIT_URL` (default `http://localhost:8025`). The helpers in
`fixtures/mailpit.ts` poll for an email by recipient address, fetch the message body,
and extract the verify-email URL. The URL is rewritten to the test's base host
(critical for Tailscale vs. localhost origin mismatch before clicking the link).

## Scenario Count Baseline

| Feature file                          | Scenarios (incl. Outline rows) |
| ------------------------------------- | ------------------------------ |
| auth/sign-up.feature                  | 1                              |
| auth/sign-up-form.feature             | 5 (2 Outline rows + 3 plain)   |
| auth/signin-errors.feature            | 3 (Outline × 3 locales)        |
| auth/sign-out.feature                 | 4                              |
| auth/duplicate-signup.feature         | 2                              |
| auth/email-verification.feature       | 4 (3 Outline rows + 1 plain)   |
| auth/auth-guards.feature              | 5 (3 Outline rows + 2 plain)   |
| auth/verify-required.feature          | 5 (2 Outline rows + 3 plain)   |
| currency/currency-picker-i18n.feature | 3 (Outline × 3 locales)        |
| **Total**                             | **32**                         |
