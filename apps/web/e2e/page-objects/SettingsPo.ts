import { expect, type Page } from "@playwright/test";

/**
 * Phase 7 Plan 07-10: Page Object for the BDP Settings tab.
 * Wraps the cushion section subset surfaced by 07-09:
 *   - Master enable/disable switch
 *   - Cushion target months input (id="cushion-target-months",
 *     label = settings.cushion.targetMonthsLabel)
 *   - Live preview text (id="cushion-preview")
 *
 * Source: apps/web/src/components/settings/cushion-section.tsx
 */
export class SettingsPo {
  constructor(private page: Page) {}

  /**
   * The cushion section in Settings is rendered inline (no accordion wrapper
   * in the current shape). This method is kept as a stub so the step file
   * can call it without conditionals and remains forward-compatible if/when
   * an accordion is reintroduced.
   */
  async openCushionSection(): Promise<void> {
    // No-op for the current settings layout. The cushion section is always
    // rendered and its inputs are immediately reachable.
    await this.cushionTargetMonthsInput().waitFor({ state: "attached" });
  }

  cushionTargetMonthsInput() {
    return this.page.locator("#cushion-target-months");
  }

  cushionPreview() {
    return this.page.locator("#cushion-preview");
  }

  /**
   * Phase 7 D-PH7-23: update the cushion target months by clearing the input,
   * filling the new value, and blurring (the component saves on blur).
   */
  async changeCushionTargetMonths(n: number): Promise<void> {
    const input = this.cushionTargetMonthsInput();
    await input.fill("");
    await input.fill(String(n));
    await input.blur();
  }

  async assertCushionTargetMonthsValue(n: number): Promise<void> {
    await expect(this.cushionTargetMonthsInput()).toHaveValue(String(n));
  }

  async assertCushionPreviewContains(text: string | RegExp): Promise<void> {
    await expect(this.cushionPreview()).toContainText(text);
  }
}
