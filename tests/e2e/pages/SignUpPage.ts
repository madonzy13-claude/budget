import { expect, type Page, type Locator } from "@playwright/test";
import { LOCALE_LABELS, type Locale } from "./labels.js";

export class SignUpPage {
  private readonly labels: (typeof LOCALE_LABELS)[Locale];

  constructor(
    private readonly page: Page,
    private readonly locale: Locale,
  ) {
    this.labels = LOCALE_LABELS[locale];
  }

  async goto(): Promise<void> {
    await this.page.goto(`/${this.locale}/sign-up`);
  }

  nameField(): Locator {
    return this.page.getByLabel(this.labels.signUp.name);
  }

  emailField(): Locator {
    return this.page.getByLabel(this.labels.signUp.email);
  }

  passwordField(): Locator {
    return this.page.getByLabel(this.labels.signUp.password);
  }

  submitButton(): Locator {
    return this.page.getByRole("button", { name: this.labels.signUp.cta });
  }

  async fill({
    name,
    email,
    password,
  }: {
    name: string;
    email: string;
    password: string;
  }): Promise<void> {
    await this.nameField().fill(name);
    await this.emailField().fill(email);
    await this.passwordField().fill(password);
  }

  async submit(): Promise<void> {
    await this.submitButton().click();
  }

  async expectVerifyPendingRedirect(): Promise<void> {
    await expect(this.page).toHaveURL(/\/(en|pl|uk)\/sign-in\?verify=pending/, {
      timeout: 10000,
    });
  }

  async expectVerifyPendingBanner(): Promise<void> {
    await expect(this.page.getByTestId("verify-pending-banner")).toBeVisible();
  }

  async expectNameRequiredError(): Promise<void> {
    await expect(
      this.page.getByText(this.labels.signUp.nameRequiredError),
    ).toBeVisible();
  }

  async expectAllFieldsVisible(): Promise<void> {
    await expect(this.nameField()).toBeVisible();
    await expect(this.emailField()).toBeVisible();
    await expect(this.passwordField()).toBeVisible();
    await expect(this.submitButton()).toBeVisible();
  }

  /** Triggers HTML5 / JS validation by clicking each field then submitting */
  async triggerEmptyValidation(): Promise<void> {
    await this.nameField().click();
    await this.emailField().click();
    await this.passwordField().click();
    await this.submitButton().click();
  }
}
