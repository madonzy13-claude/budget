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
    await editor.fill(newAmount);
    await editor.blur();
    await this.page.waitForLoadState("networkidle");
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
    const targetSection = this.section(targetType);
    await handle.hover();
    await this.page.mouse.down();
    await targetSection.hover();
    await this.page.mouse.up();
    await this.page.waitForLoadState("networkidle");
  }

  // ── Delete with confirm dialog ──────────────────────────────────────────────

  async deleteWallet(walletId: string, confirm = true): Promise<void> {
    await this.row(walletId).hover();
    await this.trashButton(walletId).click();
    const dialog = this.page.getByRole("alertdialog");
    await expect(dialog).toBeVisible({ timeout: 10000 });
    if (confirm) {
      await dialog.getByRole("button", { name: /delete/i }).click();
    } else {
      await dialog.getByRole("button", { name: /cancel/i }).click();
    }
    await this.page.waitForLoadState("networkidle");
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
