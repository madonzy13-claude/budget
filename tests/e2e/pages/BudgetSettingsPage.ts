/**
 * BudgetSettingsPage.ts — Phase 6 Budget Settings tab page object.
 *
 * The Settings tab lives at /[locale]/budgets/[id]/settings and renders
 * a 5-section accordion: identity, cushion, recurring, members, danger.
 * PRIVATE budgets show only 4 sections (no Members).
 */
import { type Page, type Locator, expect } from "@playwright/test";

export class BudgetSettingsPage {
  constructor(private readonly page: Page) {}

  // ── Navigation ──────────────────────────────────────────────────────────────

  async open(locale: string, budgetId: string): Promise<void> {
    await this.page.goto(`/${locale}/budgets/${budgetId}/settings`);
    await this.page.waitForLoadState("networkidle");
  }

  // ── Accordion sections ──────────────────────────────────────────────────────

  /** Open an accordion section by its trigger button text (partial match). */
  async openSection(name: string | RegExp): Promise<void> {
    const trigger = this.page.getByRole("button", { name, exact: false });
    await trigger.first().click();
    await this.page.waitForLoadState("networkidle");
  }

  // ── Budget Identity section ─────────────────────────────────────────────────

  identityInput(): Locator {
    return this.page.getByTestId("budget-name-input");
  }

  /** Click identity input to activate inline edit, fill new name, blur to save. */
  async renameBudget(newName: string): Promise<void> {
    const input = this.identityInput();
    await input.click();
    await input.fill(newName);
    await input.blur();
    await this.page.waitForLoadState("networkidle");
  }

  // ── Cushion section (master flag + per-month mode sub-toggle) ───────────────
  //
  // Phase 6 onboarding rewrite split the section into two switches:
  //   * "Enable cushion" — master feature flag (cushion_enabled column).
  //   * "Cushion mode"   — per-month NORMAL ↔ CUSHION toggle (cushion_mode_enabled,
  //                        SCD-2 history). Only rendered when master is on.
  //
  // Existing scenarios call `cushionSwitch()` expecting the per-month mode
  // toggle, so the default locator targets the exact "Cushion mode" label.

  cushionSwitch(): Locator {
    return this.page.getByRole("switch", { name: "Cushion mode" });
  }

  cushionFeatureSwitch(): Locator {
    return this.page.getByRole("switch", { name: "Enable cushion" });
  }

  async toggleCushion(): Promise<void> {
    await this.cushionSwitch().click();
    await this.page.waitForLoadState("networkidle");
  }

  // ── Members / Share section ─────────────────────────────────────────────────

  generateShareButton(): Locator {
    return this.page.getByRole("button", { name: /generate share link/i });
  }

  shareUrlField(): Locator {
    return this.page.getByTestId("share-url-field");
  }

  copyLinkButton(): Locator {
    return this.page.getByRole("button", { name: /copy link/i });
  }

  async generateShareLink(): Promise<void> {
    await this.generateShareButton().click();
    await this.page.waitForLoadState("networkidle");
  }

  // ── Danger Zone section ─────────────────────────────────────────────────────

  archiveButton(): Locator {
    return this.page.getByRole("button", { name: /archive budget/i });
  }

  deleteButton(): Locator {
    return this.page.getByRole("button", { name: /delete budget/i });
  }

  deleteNameInput(): Locator {
    return this.page.getByPlaceholder(/type budget name/i);
  }

  deleteForeverButton(): Locator {
    return this.page.getByRole("button", { name: /delete forever/i });
  }

  archiveConfirmButton(): Locator {
    return this.page.getByRole("button", { name: /^archive$/i });
  }

  archiveCancelButton(): Locator {
    return this.page.getByRole("button", { name: /keep it/i });
  }

  /**
   * Archive flow now routes through the Delete dialog: the standalone
   * "Archive" CTA was removed; "Delete" archives the budget after the user
   * types the budget name to confirm. Page object preserves the
   * `archiveBudget()` entry point so feature scenarios stay readable.
   */
  async archiveBudget(budgetName: string): Promise<void> {
    await this.deleteButton().click();
    await expect(this.page.getByRole("alertdialog")).toBeVisible({
      timeout: 10000,
    });
    await this.deleteNameInput().fill(budgetName);
    await expect(this.deleteForeverButton()).toBeEnabled({ timeout: 5000 });
    await this.deleteForeverButton().click();
    await this.page.waitForLoadState("networkidle");
  }

  async deleteBudget(budgetName: string): Promise<void> {
    await this.deleteButton().click();
    await expect(this.page.getByRole("alertdialog")).toBeVisible({
      timeout: 10000,
    });
    // Confirm button must be disabled until name matches
    await expect(this.deleteForeverButton()).toBeDisabled();
    await this.deleteNameInput().fill(budgetName);
    await expect(this.deleteForeverButton()).toBeEnabled({ timeout: 5000 });
    await this.deleteForeverButton().click();
    await this.page.waitForLoadState("networkidle");
  }

  // ── Toast ───────────────────────────────────────────────────────────────────

  toast(text: string | RegExp): Locator {
    return this.page.locator("[data-sonner-toast]", { hasText: text });
  }
}
