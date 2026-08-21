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
    // Uncontrolled input (defaultValue): fill() works reliably without
    // reformatting interference on each keystroke.
    await editor.fill(newAmount);
    await editor.blur();
    await this.page.waitForLoadState("networkidle");
  }

  // ── Drag between sections ───────────────────────────────────────────────────

  async dragToExcluded(categoryId: string): Promise<void> {
    await this._dragInto(categoryId, this.excludedSection());
  }

  async dragToActive(categoryId: string): Promise<void> {
    await this._dragInto(categoryId, this.activeSection());
  }

  /**
   * Drag a row into a section, and CONFIRM it landed.
   *
   * dnd-kit resolves the drop target from the pointer position observed on a
   * RENDERED frame, not from the mouseup. Two rounds of hardening (measure the
   * target mid-drag; an extra move plus a 60ms grace before the release) cut the
   * loss rate but could not remove it: under load a frame can take longer than
   * any fixed grace, and when none lands `over` is still null at mouseup and the
   * drop is DISCARDED — silently. No error, no request, the row simply stays put
   * and the next step waits 15s for something that was never going to arrive
   * (~1 run in 5, measured 260821 with retries off).
   *
   * A discarded drop is a harness artefact, not a product failure — a real
   * finger always crosses several frames — so the fix is to notice and drag
   * again rather than to wait longer and hope. Bounded at three attempts: if the
   * row genuinely cannot be moved, this still fails, and fails with the row's
   * real absence rather than with a timeout inside an unrelated Then step.
   */
  private async _dragInto(
    categoryId: string,
    target: import("@playwright/test").Locator,
  ): Promise<void> {
    const landed = target.locator(`[data-category-id="${categoryId}"]`);
    for (let attempt = 1; attempt <= 3; attempt++) {
      await this._dndKitDrag(
        this.row(categoryId).getByRole("button", { name: /drag|move/i }),
        target,
      );
      if ((await landed.count()) > 0) return;
    }
  }

  /** dnd-kit drag using page.mouse — PointerSensor requires pointer events on document. */
  private async _dndKitDrag(
    handle: import("@playwright/test").Locator,
    target: import("@playwright/test").Locator,
  ): Promise<void> {
    const handleBox = await handle.boundingBox();
    if (!handleBox) throw new Error("DnD: bounding boxes unavailable");

    const fromX = handleBox.x + handleBox.width / 2;
    const fromY = handleBox.y + handleBox.height / 2;

    await this.page.mouse.move(fromX, fromY);
    await this.page.mouse.down();
    await this.page.mouse.move(fromX + 5, fromY + 5, { steps: 3 });

    // Measure the destination ONCE THE DRAG IS UNDER WAY, not before it. Lifting
    // a row out of its section collapses that row and re-flows everything below,
    // so coordinates taken before mouse.down can point somewhere else entirely by
    // the time the pointer arrives — which is how "drag back to Active" kept
    // dropping the row into Excluded again (~1 run in 4, both projects).
    const targetBox = await target.boundingBox();
    if (!targetBox) throw new Error("DnD: bounding boxes unavailable");
    const toX = targetBox.x + targetBox.width / 2;
    const toY = targetBox.y + targetBox.height / 2;

    await this.page.mouse.move(toX, toY, { steps: 10 });
    // dnd-kit resolves the drop target from the pointer position observed on a
    // rendered frame, not from the mouseup itself. Releasing on the very frame
    // the pointer arrives sometimes left `over` still null and the drop was
    // discarded — the restore-to-Active step then never found its row (~1 run
    // in 4). One more move on the spot plus a frame's grace gives the collision
    // pass a tick to run before the release. (Harness only: dragging by hand
    // always crosses several frames.)
    await this.page.mouse.move(toX + 1, toY + 1, { steps: 2 });
    await this.page.waitForTimeout(60);
    await this.page.mouse.up();
    await this.page.waitForLoadState("networkidle");
  }
}
