import type { Page } from "@playwright/test";

/**
 * Page Object for /[locale]/oauth/consent (Phase 15): the page an MCP client's
 * authorization request lands on. Source: components/oauth/consent-form.tsx.
 */
export class ConsentPo {
  constructor(private page: Page) {}

  /** The heading names the client: "{client} wants to connect to your budgets". */
  clientName(name: string) {
    return this.page.getByRole("heading", { level: 1 }).filter({ hasText: name });
  }

  /** The all-budgets statement, in whatever locale the page is in. */
  statement(text: string) {
    return this.page.getByText(text, { exact: true });
  }

  async allow(label: string): Promise<void> {
    await this.page.getByRole("button", { name: label, exact: true }).click();
  }

  async deny(label: string): Promise<void> {
    await this.page.getByRole("button", { name: label, exact: true }).click();
  }
}
