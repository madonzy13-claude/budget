import { expect, type Page, type Locator } from "@playwright/test";

/**
 * RecurringPage — Page Object for /[locale]/(app)/recurring
 *
 * Wraps the rule form (Dialog), rules list and pending drafts inbox.
 * Per UI-SPEC + D-01-d: edit mode renders a pre-checked
 * "Also apply to future occurrences" checkbox.
 */
export class RecurringPage {
  constructor(private readonly page: Page) {}

  async goto(locale = "en"): Promise<void> {
    await this.page.goto(`/${locale}/recurring`);
  }

  // ── Top-of-page CTA ──────────────────────────────────────────────────────

  addRuleButton(): Locator {
    return this.page.getByRole("button", { name: /add recurring rule/i });
  }

  async clickAddRule(): Promise<void> {
    await this.addRuleButton().click();
  }

  // ── Rule form (Dialog) ───────────────────────────────────────────────────

  amountInput(): Locator {
    return this.page.locator("#rr-amount");
  }

  currencyInput(): Locator {
    return this.page.locator("#rr-currency");
  }

  accountInput(): Locator {
    return this.page.locator("#rr-account");
  }

  anchorInput(): Locator {
    return this.page.locator("#rr-anchor");
  }

  weekdayTrigger(): Locator {
    return this.page.locator("#rr-dow");
  }

  firstDueInput(): Locator {
    return this.page.locator("#rr-firstdue");
  }

  noteInput(): Locator {
    return this.page.locator("#rr-note");
  }

  monthlyButton(): Locator {
    return this.page.getByRole("button", { name: /^monthly$/i });
  }

  weeklyButton(): Locator {
    return this.page.getByRole("button", { name: /^weekly$/i });
  }

  saveRuleButton(): Locator {
    return this.page.getByRole("button", { name: /save rule/i });
  }

  applyToFutureCheckbox(): Locator {
    return this.page.getByLabel(/also apply to future occurrences/i);
  }

  async fillRuleFormCreate(opts: {
    amount: string;
    currency: string;
    accountId?: string;
    cadence: "MONTHLY" | "WEEKLY";
    anchorDay?: string;
    weeklyDow?: string;
    firstDueDate: string;
    note?: string;
  }): Promise<void> {
    await this.amountInput().fill(opts.amount);
    await this.currencyInput().fill(opts.currency);
    if (opts.cadence === "MONTHLY") {
      await this.monthlyButton().click();
      if (opts.anchorDay) {
        await this.anchorInput().fill(opts.anchorDay);
      }
    } else {
      await this.weeklyButton().click();
      if (opts.weeklyDow) {
        await this.weekdayTrigger().click();
        await this.page
          .getByRole("option", { name: new RegExp(opts.weeklyDow, "i") })
          .first()
          .click();
      }
    }
    if (opts.accountId) {
      await this.accountInput().fill(opts.accountId);
    }
    await this.firstDueInput().fill(opts.firstDueDate);
    if (opts.note) {
      await this.noteInput().fill(opts.note);
    }
  }

  async saveRule(): Promise<void> {
    await this.saveRuleButton().click();
    // Form reloads page after save (see recurring-page-client.tsx onSaved).
    await this.page.waitForLoadState("networkidle");
  }

  // ── Rules list ───────────────────────────────────────────────────────────

  ruleRow(amount: string): Locator {
    return this.page
      .locator("ul li")
      .filter({ hasText: amount });
  }

  async expectRuleInList(amount: string): Promise<void> {
    await expect(this.ruleRow(amount).first()).toBeVisible({ timeout: 10000 });
  }

  async expectCadenceLabel(label: string): Promise<void> {
    await expect(this.page.getByText(new RegExp(label, "i")).first()).toBeVisible({
      timeout: 10000,
    });
  }

  async openEditForRule(noteOrAmount: string): Promise<void> {
    const row = this.ruleRow(noteOrAmount).first();
    await row.getByRole("button", { name: /^edit$/i }).click();
  }

  async fillEditAmount(amount: string): Promise<void> {
    await this.amountInput().fill(amount);
  }

  // ── Pending drafts inbox ─────────────────────────────────────────────────

  pendingDraftsList(): Locator {
    return this.page.getByTestId("pending-drafts-inbox");
  }

  draftRow(amount: string): Locator {
    return this.pendingDraftsList()
      .locator("li")
      .filter({ hasText: amount });
  }

  async expectPendingDraft(amount: string): Promise<void> {
    await expect(this.draftRow(amount).first()).toBeVisible({ timeout: 10000 });
  }

  async confirmFirstDraft(): Promise<void> {
    await this.pendingDraftsList()
      .getByRole("button", { name: /confirm transaction/i })
      .first()
      .click();
    await this.page.waitForLoadState("networkidle");
  }
}
