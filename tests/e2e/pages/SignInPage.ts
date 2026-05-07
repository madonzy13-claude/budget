import { expect, type Page, type Locator } from "@playwright/test";
import { LOCALE_LABELS, type Locale } from "./labels.js";

export class SignInPage {
  private readonly labels: (typeof LOCALE_LABELS)[Locale];

  constructor(
    private readonly page: Page,
    private readonly locale: Locale,
  ) {
    this.labels = LOCALE_LABELS[locale];
  }

  async goto(): Promise<void> {
    await this.page.goto(`/${this.locale}/sign-in`);
  }

  emailField(): Locator {
    return this.page.getByLabel(this.labels.signIn.email);
  }

  passwordField(): Locator {
    return this.page.getByLabel(this.labels.signIn.password);
  }

  submitButton(): Locator {
    return this.page.getByRole("button", { name: this.labels.signIn.cta });
  }

  async fill({
    email,
    password,
  }: {
    email: string;
    password: string;
  }): Promise<void> {
    await this.emailField().fill(email);
    await this.passwordField().fill(password);
  }

  async submit(): Promise<void> {
    await this.submitButton().click();
  }

  async expectInvalidCredentialsError(): Promise<void> {
    await expect(
      this.page.getByText(this.labels.signIn.invalidCredentials),
    ).toBeVisible({ timeout: 10000 });
  }

  async expectEmailNotVerifiedError(): Promise<void> {
    await expect(
      this.page.getByText(this.labels.signIn.emailNotVerified),
    ).toBeVisible({ timeout: 10000 });
  }

  async expectEmailNotVerifiedErrorAbsent(): Promise<void> {
    await expect(
      this.page.getByText(this.labels.signIn.emailNotVerified),
    ).toHaveCount(0);
  }

  async expectStaysOnSignIn(): Promise<void> {
    await expect(this.page).toHaveURL(/\/sign-in/);
  }
}
