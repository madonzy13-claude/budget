import { expect, type Page } from "@playwright/test";
import { SpendingsPo } from "./SpendingsPo";

/** Phase 14: the category add/edit slider's currency field (UI-SPEC §1). */
export class CategorySliderPo {
  constructor(private page: Page) {}

  private sheet() {
    return this.page.getByTestId("cat-slider-content");
  }

  private picker() {
    return this.sheet().getByTestId("category-currency-picker");
  }

  async openAdd(): Promise<void> {
    await this.page.getByTestId("add-category-column").click();
    await expect(this.sheet()).toBeVisible({ timeout: 10000 });
  }

  async openEdit(name: string): Promise<void> {
    const po = new SpendingsPo(this.page);
    await po.columnHeader(name).hover();
    await po.columnPen(name).click();
    await expect(this.sheet()).toBeVisible({ timeout: 10000 });
  }

  async setName(name: string): Promise<void> {
    await this.sheet().locator("#cat-slider-name").fill(name);
  }

  async setCurrency(ccy: string): Promise<void> {
    const native = this.picker().getByTestId("currency-picker-native");
    if (await native.isVisible().catch(() => false)) {
      await native.selectOption(ccy);
    } else {
      await this.picker().getByRole("combobox").click();
      await this.page.getByRole("option").filter({ hasText: ccy }).first().click();
    }
  }

  async assertCurrency(ccy: string): Promise<void> {
    const native = this.picker().getByTestId("currency-picker-native");
    if (await native.isVisible({ timeout: 5000 }).catch(() => false)) await expect(native).toHaveValue(ccy);
    else await expect(this.picker()).toContainText(ccy);
  }

  async assertHint(): Promise<void> {
    await expect(this.sheet().getByTestId("category-currency-hint")).toBeVisible({ timeout: 10000 });
  }

  /** The converted limit shows in the planned readout, in the new currency. */
  async assertPreview(sign: string): Promise<void> {
    await expect(this.sheet().getByTestId("cat-slider-planned-readout")).toContainText(sign, { timeout: 10000 });
  }

  async save(): Promise<void> {
    // Add posts /categories; edit always PATCHes /categories/:id. The limits
    // POST is skipped when only the currency changed (the server's conversion
    // is the limit), so it is no signal that the save finished.
    const done = this.page.waitForResponse(
      (r) => {
        const m = r.request().method();
        const path = new URL(r.url()).pathname;
        return (m === "POST" && /\/categories$/.test(path)) || (m === "PATCH" && /\/categories\/[^/]+$/.test(path));
      },
      { timeout: 15000 },
    );
    await this.sheet().locator('button[type="submit"]').click();
    if (!(await done).ok()) throw new Error("category save failed");
    await expect(this.sheet()).toBeHidden({ timeout: 10000 });
  }
}
