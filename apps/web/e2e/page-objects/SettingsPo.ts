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
   * Settings page renders sections inside a Radix Accordion (settings-accordion.tsx).
   * `defaultValue={["budget-identity"]}` means only the Budget Identity section is
   * expanded on first render — Cushion (value="cushion") starts collapsed and its
   * inputs are not in the DOM. This method clicks the "Cushion" trigger to expand
   * the section, then waits for the months input to be attached.
   *
   * Trigger label comes from i18n `settings.sections.cushion` (EN: "Cushion"). E2E
   * runs in the EN locale by default so the text-based locator is stable.
   */
  async openCushionSection(): Promise<void> {
    const trigger = this.page.getByRole("button", {
      name: /^Cushion$/,
    });
    // If already expanded the trigger has aria-expanded="true"; click to expand
    // only when collapsed to keep the method idempotent.
    if ((await trigger.getAttribute("aria-expanded")) !== "true") {
      await trigger.click();
    }
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
