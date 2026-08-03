import { expect, type Page } from "@playwright/test";

/**
 * Page Object for the five wallet sections on the BDP Wallets tab.
 *
 * Selector contract (wallet-section.tsx / wallet-row.tsx):
 *   data-testid="wallet-section-<TYPE>"   section wrapper (TYPE = SPENDINGS,
 *                                         CUSHION, RESERVE, POSSESSION, OTHER)
 *   data-testid="add-wallet-<key>"        dashed "+ Add …" row
 *   data-testid="wallet-row"              a persisted row (data-wallet-id)
 *
 * Cross-section moves go through the KEYBOARD drag sensor: a synthetic pointer
 * drag does not activate dnd-kit reliably, while Space-to-lift / arrows /
 * Space-to-drop is a real user path and fires the same drop handler.
 */
export class WalletSectionsPo {
  constructor(private page: Page) {}

  section(type: string) {
    return this.page.getByTestId(`wallet-section-${type}`);
  }

  row(section: string, name: string) {
    return this.section(section)
      .locator('[data-testid="wallet-row"]')
      .filter({ hasText: name });
  }

  /** Reveal the section's inline draft row, name it, and commit (Enter → POST). */
  async addWallet(section: string, name: string): Promise<void> {
    await this.section(section)
      .getByTestId(`add-wallet-${section.toLowerCase()}`)
      .click();
    const nameInput = this.section(section).locator(
      'input[placeholder="Wallet name"]',
    );
    await nameInput.waitFor({ state: "visible" });
    await nameInput.fill(name);
    // Commit fires POST /wallets — wait for it so a following reload cannot
    // cancel the in-flight request.
    const created = this.page.waitForResponse(
      (r) =>
        /\/wallets(\?.*)?$/.test(r.url()) && r.request().method() === "POST",
      { timeout: 15000 },
    );
    await nameInput.press("Enter");
    const res = await created;
    if (!res.ok()) {
      throw new Error(
        `create wallet POST failed: ${res.status()} ${res.url()}`,
      );
    }
    await expect(this.row(section, name)).toBeVisible();
  }

  /** Keyboard-drag a wallet until it hovers `toSection`, then drop it.
   *
   *  The DOM does not move during a keyboard drag — dnd-kit moves an overlay —
   *  so the only honest signal for "where am I now" is its own screen-reader
   *  announcement, which names the droppable under the cursor. */
  async moveWallet(name: string, toSection: string): Promise<void> {
    const handle = this.page.locator(
      `[aria-label="Drag to move ${name} to another section."]`,
    );
    await handle.focus();
    await this.page.keyboard.press("Space");
    // The lift itself is async (dnd-kit measures every droppable first); an
    // arrow pressed before it settles is swallowed and the drag drifts.
    await this.page.waitForTimeout(400);
    const over = () =>
      this.page.evaluate(() =>
        [...document.querySelectorAll('[role="status"], [aria-live]')]
          .map((n) => n.textContent ?? "")
          .join(" "),
      );
    let landed = false;
    for (let i = 0; i < 12 && !landed; i++) {
      await this.page.keyboard.press("ArrowDown");
      await this.page.waitForTimeout(200);
      landed = (await over()).includes(`section-${toSection}`);
    }
    if (!landed) {
      await this.page.keyboard.press("Escape");
      throw new Error(`keyboard drag never reached section-${toSection}`);
    }
    const patched = this.page.waitForResponse(
      (r) => /\/wallets\//.test(r.url()) && r.request().method() === "PATCH",
      { timeout: 15000 },
    );
    await this.page.keyboard.press("Space");
    const res = await patched;
    if (!res.ok()) {
      throw new Error(`move wallet PATCH failed: ${res.status()} ${res.url()}`);
    }
  }
}
