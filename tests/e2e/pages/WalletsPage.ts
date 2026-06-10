/**
 * WalletsPage.ts — Phase 5 rewrite (W-5 alignment).
 *
 * W-5 contract: every persisted WalletRow emits BOTH:
 *   data-testid="wallet-row"      (semantic, for role-based queries)
 *   data-wallet-id="<uuid>"       (for UUID resolution by name — this is the W-5 contract)
 *
 * ALL wallet-by-name lookups go through resolveIdByName() which reads
 * data-wallet-id. NEVER regex-parse testid strings for UUIDs.
 */
import { type Page, type Locator, expect } from "@playwright/test";

export class WalletsPage {
  constructor(private readonly page: Page) {}

  // ── Navigation ──────────────────────────────────────────────────────────────

  async open(budgetId: string): Promise<void> {
    await this.page.goto(`/en/budgets/${budgetId}/wallets`);
    await this.page.waitForLoadState("networkidle");
  }

  // ── Section containers ──────────────────────────────────────────────────────

  section(type: "SPENDINGS" | "CUSHION" | "RESERVE"): Locator {
    return this.page.getByTestId(`wallet-section-${type}`);
  }

  sectionHeader(type: "SPENDINGS" | "CUSHION" | "RESERVE"): Locator {
    return this.section(type).getByRole("heading");
  }

  // ── Row lookup ──────────────────────────────────────────────────────────────

  /** Row by UUID (after resolving via W-5 data-wallet-id). */
  row(walletId: string): Locator {
    return this.page.locator(`[data-wallet-id="${walletId}"]`);
  }

  /**
   * Locate a persisted row by visible name. Plan 05 emits:
   *   data-testid="wallet-row"  +  data-wallet-id="<uuid>"
   * on every persisted WalletRow.
   */
  rowByName(name: string): Locator {
    return this.page.locator('[data-testid="wallet-row"]', { hasText: name });
  }

  /**
   * W-5: resolve the wallet UUID from its visible name.
   * Reads data-wallet-id — does NOT parse testid strings.
   */
  async resolveIdByName(name: string): Promise<string> {
    const row = this.rowByName(name);
    await row.waitFor({ state: "visible", timeout: 15000 });
    const id = await row.getAttribute("data-wallet-id");
    if (!id) {
      throw new Error(
        `Wallet "${name}" found but data-wallet-id is empty. ` +
          `Is it a draft? W-5 contract: draft rows have empty data-wallet-id.`,
      );
    }
    return id;
  }

  // ── Draft row (W-4 staged-add) ──────────────────────────────────────────────

  draftRow(): Locator {
    return this.page.locator('[data-testid="wallet-row-draft"]');
  }

  draftNameInput(): Locator {
    return this.page.locator('[data-testid="wallet-draft-name-input"]');
  }

  // ── Action buttons ──────────────────────────────────────────────────────────

  addButton(type: "spendings" | "cushion" | "reserve"): Locator {
    return this.page.getByTestId(`add-wallet-${type}`);
  }

  trashButton(walletId: string): Locator {
    return this.page.getByTestId(`wallet-trash-${walletId}`);
  }

  // ── Cells (keyed by UUID after W-5 resolution) ──────────────────────────────

  nameCell(walletId: string): Locator {
    return this.page.getByTestId(`wallet-name-${walletId}`);
  }

  currencyCell(walletId: string): Locator {
    return this.page.getByTestId(`wallet-currency-${walletId}`);
  }

  amountCell(walletId: string): Locator {
    return this.page.getByTestId(`wallet-amount-${walletId}`);
  }

  // ── Inline-edit actions ─────────────────────────────────────────────────────

  async editName(walletId: string, newName: string): Promise<void> {
    await this.nameCell(walletId).click();
    // InlineEditCell pattern from Plan 05: testid="${field}-${id}-editor" wraps an <input>
    const editor = this.page
      .getByTestId(`wallet-name-${walletId}-editor`)
      .locator("input");
    await editor.fill(newName);
    await editor.blur();
    await this.page.waitForLoadState("networkidle");
  }

  async editAmount(walletId: string, newAmount: string): Promise<void> {
    await this.amountCell(walletId).click();
    const editor = this.page
      .getByTestId(`wallet-amount-${walletId}-editor`)
      .locator("input");
    // Uncontrolled input: fill() dispatches input+change events and works
    // reliably across React renders without reformatting interference.
    await editor.fill(newAmount);
    await editor.blur();
    await this.page.waitForLoadState("networkidle");
    // Confirm the PATCH completed — failed saves show data-state="failed" with ring.
    await this.amountCell(walletId).waitFor({
      state: "visible",
      timeout: 10000,
    });
    const state = await this.amountCell(walletId).getAttribute("data-state");
    if (state === "failed") {
      throw new Error(
        `editAmount: wallet ${walletId} amount edit failed — cell shows data-state="failed"`,
      );
    }
  }

  async editCurrency(walletId: string, newCurrency: string): Promise<void> {
    await this.currencyCell(walletId).click();
    await this.page.getByRole("option", { name: newCurrency }).click();
    await this.page.waitForLoadState("networkidle");
  }

  // ── Drag between sections ───────────────────────────────────────────────────

  async dragToSection(
    walletId: string,
    targetType: "SPENDINGS" | "CUSHION" | "RESERVE",
  ): Promise<void> {
    const handle = this.row(walletId).getByRole("button", {
      name: /drag|move/i,
    });
    // Target the section HEADING (not the wrapper). Phase 6 dropped the
    // bounded-height scroll container so empty sections now collapse to
    // ~60 px (heading + add-button). The wrapper's vertical mid-point of
    // an empty section can fall into the NEXT section below, which made
    // dnd-kit pick the wrong droppable. The heading sits at the very top
    // of the section and is always inside the wrapper's droppable rect.
    const targetHeader = this.section(targetType).getByRole("heading");

    // dnd-kit PointerSensor needs pointer events dispatched globally.
    // Use page.mouse with steps for realistic movement.
    const handleBox = await handle.boundingBox();
    const targetBox = await targetHeader.boundingBox();
    if (!handleBox || !targetBox)
      throw new Error("DnD: bounding boxes unavailable");

    const fromX = handleBox.x + handleBox.width / 2;
    const fromY = handleBox.y + handleBox.height / 2;
    const toX = targetBox.x + targetBox.width / 2;
    const toY = targetBox.y + targetBox.height / 2;

    await this.page.mouse.move(fromX, fromY);
    await this.page.mouse.down();
    // Move in steps so PointerSensor activation distance (4px) is satisfied.
    await this.page.mouse.move(fromX + 5, fromY + 5, { steps: 3 });
    await this.page.mouse.move(toX, toY, { steps: 10 });
    await this.page.mouse.up();
    await this.page.waitForLoadState("networkidle");
  }

  // ── Delete with confirm dialog ──────────────────────────────────────────────

  /**
   * Reveal a row's delete affordance and open the confirm dialog.
   *
   * The wallet row exposes TWO delete affordances by viewport (wallet-row.tsx
   * D-PH5-W5 / W6):
   *   • desktop (≥sm / 640px): in-row trash button `wallet-trash-<id>`,
   *     `hidden sm:flex`, revealed on row hover.
   *   • mobile (<sm): a horizontal swipe-left reveals `wallet-swipe-delete-<id>`;
   *     the in-row trash stays `display:none` and never becomes clickable.
   *
   * The page object must use the affordance that actually exists for the
   * running project's viewport, else the click times out on a hidden node.
   */
  async deleteWallet(walletId: string, confirm = true): Promise<void> {
    const viewport = this.page.viewportSize();
    const isMobile = viewport !== null && viewport.width < 640;
    if (isMobile) {
      await this.swipeRowOpen(walletId);
      await this.page.getByTestId(`wallet-swipe-delete-${walletId}`).click();
    } else {
      await this.row(walletId).hover();
      await this.trashButton(walletId).click();
    }
    const dialog = this.page.getByRole("alertdialog");
    await expect(dialog).toBeVisible({ timeout: 10000 });
    if (confirm) {
      await dialog.getByRole("button", { name: /delete/i }).click();
    } else {
      await dialog.getByRole("button", { name: /cancel/i }).click();
    }
    await this.page.waitForLoadState("networkidle");
  }

  /**
   * Mobile-only: drive a horizontal swipe-left on a wallet row so the
   * `wallet-swipe-delete-<id>` CTA slides into view.
   *
   * wallet-row.tsx attaches native pointer listeners with `passive:false`
   * and ignores any pointer whose `pointerType` is not "touch"/"pen", so a
   * `page.mouse` drag (pointerType "mouse") cannot trigger it. We dispatch a
   * synthetic touch-pointer sequence on the row wrapper instead:
   *   down → move (locks the gesture, >10px) → move (past ACTION_W/2) → up.
   * A timeout between the last move and `pointerup` lets React commit + run
   * the passive effect that syncs `offsetRef`, which the up-handler reads to
   * decide whether to snap the row open.
   */
  private async swipeRowOpen(walletId: string): Promise<void> {
    const wrapper = this.page.locator(
      `[data-wallet-row-wrapper="${walletId}"]`,
    );
    await wrapper.waitFor({ state: "visible", timeout: 10000 });
    await wrapper.evaluate((el: HTMLElement) => {
      const rect = el.getBoundingClientRect();
      const y = rect.top + rect.height / 2;
      const startX = rect.right - 20;
      const pointerId = 9001;
      const fire = (type: string, x: number): void => {
        el.dispatchEvent(
          new PointerEvent(type, {
            pointerId,
            pointerType: "touch",
            clientX: x,
            clientY: y,
            bubbles: true,
            cancelable: true,
          }),
        );
      };
      fire("pointerdown", startX);
      fire("pointermove", startX - 20);
      fire("pointermove", startX - 88);
      return new Promise<void>((resolve) => {
        // Let React commit the offset render + run the passive effect that
        // updates offsetRef before pointerup reads it.
        setTimeout(() => {
          fire("pointerup", startX - 88);
          resolve();
        }, 80);
      });
    });
    // wallet-row.tsx suppresses synthetic clicks for 400ms after pointerup
    // (iOS ghost-click guard). Wait it out before the CTA becomes clickable.
    await this.page.waitForTimeout(500);
    await expect(
      this.page.getByTestId(`wallet-swipe-delete-${walletId}`),
    ).toBeVisible({ timeout: 5000 });
  }

  // ── W-4 staged-add helper ───────────────────────────────────────────────────

  /**
   * Click the +Add button, fill the draft name input, blur to commit.
   * Returns the persisted wallet's UUID (resolved via data-wallet-id).
   */
  async addWalletStaged(
    type: "spendings" | "cushion" | "reserve",
    name: string,
  ): Promise<string> {
    await this.addButton(type).click();
    await this.draftRow().waitFor({ state: "visible", timeout: 10000 });
    await this.draftNameInput().fill(name);
    await this.draftNameInput().blur();
    // After blur the draft commits → persisted row with data-wallet-id appears
    await this.page.waitForLoadState("networkidle");
    return this.resolveIdByName(name);
  }

  // ── Toast ───────────────────────────────────────────────────────────────────

  toast(text: string | RegExp): Locator {
    return this.page.locator("[data-sonner-toast]", { hasText: text });
  }
}
