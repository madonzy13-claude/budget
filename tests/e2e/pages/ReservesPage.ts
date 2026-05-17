/**
 * ReservesPage.ts — Phase 5 (Plan 06 consumer).
 *
 * W-5 contract: every ReservesTableRow emits BOTH:
 *   data-testid="reserves-row-{categoryId}"   (semantic)
 *   data-category-id="{categoryId}"           (UUID resolution contract)
 *
 * ALL category-by-name lookups go through resolveCategoryIdByName() which
 * reads data-category-id. NEVER regex-parse testid strings for UUIDs.
 */
import { type Page, type Locator } from "@playwright/test";

export class ReservesPage {
  constructor(private readonly page: Page) {}

  // ── Navigation ──────────────────────────────────────────────────────────────

  async open(budgetId: string): Promise<void> {
    await this.page.goto(`/en/budgets/${budgetId}/reserves`);
    await this.page.waitForLoadState("networkidle");
  }

  // ── Section containers ──────────────────────────────────────────────────────

  activeSection(): Locator {
    return this.page.getByTestId("reserves-active-section");
  }

  excludedSection(): Locator {
    return this.page.getByTestId("reserves-excluded-section");
  }

  // ── Row lookup ──────────────────────────────────────────────────────────────

  /** Row by UUID (after resolving via W-5 data-category-id). */
  row(categoryId: string): Locator {
    return this.page.getByTestId(`reserves-row-${categoryId}`);
  }

  /**
   * Locate a row by visible category name. Plan 06 emits:
   *   data-testid="reserves-row-{categoryId}"  +  data-category-id="{categoryId}"
   * on every ReservesTableRow.
   */
  rowByCategoryName(name: string): Locator {
    return this.page.locator("[data-category-id]", { hasText: name });
  }

  /**
   * W-5: resolve the category UUID from its visible name.
   * Reads data-category-id — does NOT parse testid strings.
   */
  async resolveCategoryIdByName(name: string): Promise<string> {
    const row = this.rowByCategoryName(name);
    await row.waitFor({ state: "visible", timeout: 15000 });
    const id = await row.getAttribute("data-category-id");
    if (!id) {
      throw new Error(
        `Category "${name}" row found but data-category-id is empty.`,
      );
    }
    return id;
  }

  // ── Cells ───────────────────────────────────────────────────────────────────

  balanceCell(categoryId: string): Locator {
    return this.page.getByTestId(`reserves-balance-${categoryId}`);
  }

  // ── Footer / totals ─────────────────────────────────────────────────────────

  totalsFooter(): Locator {
    return this.page.getByTestId("reserves-totals-footer");
  }

  mismatchChip(variant: "overfunded" | "underfunded" | "reconciled"): Locator {
    return this.page.getByTestId(`mismatch-chip-${variant}`);
  }

  // ── Inline-edit reserve balance ─────────────────────────────────────────────

  async editBalance(categoryId: string, newAmount: string): Promise<void> {
    await this.balanceCell(categoryId).click();
    const editor = this.page
      .getByTestId(`reserves-balance-${categoryId}-editor`)
      .locator("input");
    await editor.fill(newAmount);
    await editor.blur();
    await this.page.waitForLoadState("networkidle");
  }

  // ── Drag between sections ───────────────────────────────────────────────────

  async dragToExcluded(categoryId: string): Promise<void> {
    const handle = this.row(categoryId).getByRole("button", {
      name: /drag|move/i,
    });
    // Use dragTo which handles pointer events correctly for dnd-kit PointerSensor.
    await handle.dragTo(this.excludedSection(), { force: true });
    await this.page.waitForLoadState("networkidle");
  }

  async dragToActive(categoryId: string): Promise<void> {
    const handle = this.row(categoryId).getByRole("button", {
      name: /drag|move/i,
    });
    // Use dragTo which handles pointer events correctly for dnd-kit PointerSensor.
    await handle.dragTo(this.activeSection(), { force: true });
    await this.page.waitForLoadState("networkidle");
  }
}
