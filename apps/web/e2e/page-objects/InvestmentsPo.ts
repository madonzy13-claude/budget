import { expect, type Page } from "@playwright/test";

/**
 * Plan 09-05 (Wave 0): Page Object for the BDP Wallets-tab Investments section.
 *
 * Selector contract — Plan 09-07 MUST add these test ids to the UI:
 *   data-testid="investments-section"                in investments-section.tsx
 *   data-testid="add-investment-button"              the dashed "+ Add investment" row
 *   data-testid="holding-sheet"                      the add/edit Sheet
 *   data-testid="holding-sheet-name"                 name input (custom holdings)
 *   data-testid="holding-sheet-amount"               amount/value input (cents)
 *   data-testid="holding-sheet-submit"               Sheet save button
 *   data-testid="holding-row-<name>"                 a holding row (read-only)
 *   data-testid="investment-group-<group>"           a collapsible group header
 *
 * Until 09-07 lands these ids the @investments-wallet feature stays @skip-phase-09-debt.
 */
export class InvestmentsPo {
  constructor(private page: Page) {}

  section() {
    return this.page.getByTestId("investments-section");
  }

  addButton() {
    return this.page.getByTestId("add-investment-button");
  }

  sheet() {
    return this.page.getByTestId("holding-sheet");
  }

  row(name: string) {
    return this.page.getByTestId(`holding-row-${name}`);
  }

  groupHeader(group: string) {
    return this.page.getByTestId(`investment-group-${group}`);
  }

  /** The group header body — carries aria-expanded (read state from here). On
   *  mobile, clicking the body reveals the P/L sum-up, NOT expand/collapse. */
  groupToggle(group: string) {
    return this.page.getByTestId(`investment-group-toggle-${group}`);
  }

  /** The chevron — always toggles expand/collapse on BOTH desktop and mobile. */
  groupChevron(group: string) {
    return this.page.getByTestId(`investment-group-chevron-${group}`);
  }

  /** Expand a group if it is collapsed (idempotent). Reads state from the body
   *  (aria-expanded) but clicks the chevron, which toggles on mobile too. */
  async expandGroup(group: string): Promise<void> {
    const toggle = this.groupToggle(group);
    await toggle.waitFor({ state: "visible" });
    if ((await toggle.getAttribute("aria-expanded")) !== "true") {
      await this.groupChevron(group).click();
    }
  }

  /** Open the Sheet and create a manual ("Other") holding with a value (cents).
   *  Type-first (9.1): pick a manual type so the name + editable amount appear. */
  async addCustomHolding(name: string, amountCents: number): Promise<void> {
    await this.addButton().click();
    await this.sheet().waitFor({ state: "visible" });
    // The Type dropdown auto-opens on create; only tap the trigger to open it if
    // it isn't already showing its options (tapping an open trigger closes it).
    const otherOption = this.page.getByTestId("holding-type-other");
    if (!(await otherOption.isVisible().catch(() => false))) {
      await this.page.getByTestId("holding-sheet-type").click();
    }
    await otherOption.waitFor({ state: "visible" });
    await otherOption.click();
    // Wait for the manual layout (editable amount) to render before filling so
    // the field-fill never races the Type select swap.
    const amount = this.page.getByTestId("holding-sheet-amount");
    await amount.waitFor({ state: "visible" });
    await this.page.getByTestId("holding-sheet-name").fill(name);
    await amount.fill(String(amountCents));
    // The Save handler is fire-and-forget optimistic: it mutate()s and closes the
    // sheet immediately, so the create POST is still in flight when this method
    // returns. A following page.reload() then CANCELS that in-flight POST (a
    // navigation aborts pending fetches) and the holding never persists — a ~50%
    // flake on the persistence guard. Wait for the POST to actually land before
    // returning so reload can't race it.
    const createPosted = this.page.waitForResponse(
      (r) =>
        /\/budgets\/[^/]+\/investments(\?.*)?$/.test(r.url()) &&
        r.request().method() === "POST",
      { timeout: 15000 },
    );
    await this.page.getByTestId("holding-sheet-submit").click();
    const res = await createPosted;
    if (!res.ok()) {
      throw new Error(
        `create holding POST failed: ${res.status()} ${res.url()}`,
      );
    }
  }

  /** Open the Sheet and create a Savings holding (starting + current amount, no
   *  quantity). Amounts are major units (e.g. "10000" = 10,000.00). */
  async addSavingsHolding(
    name: string,
    starting: string,
    current: string,
  ): Promise<void> {
    await this.addButton().click();
    await this.sheet().waitFor({ state: "visible" });
    const savingsOption = this.page.getByTestId("holding-type-savings");
    if (!(await savingsOption.isVisible().catch(() => false))) {
      await this.page.getByTestId("holding-sheet-type").click();
    }
    await savingsOption.waitFor({ state: "visible" });
    await savingsOption.click();
    // Savings reuses the broker field-set: name + starting (deposited) + current
    // (actual), no quantity. Wait for the starting field before filling.
    const startingInput = this.page.getByTestId("holding-sheet-deposited");
    await startingInput.waitFor({ state: "visible" });
    await this.page.getByTestId("holding-sheet-name").fill(name);
    await startingInput.fill(starting);
    await this.page.getByTestId("holding-sheet-actual").fill(current);
    // Wait for the create POST to land before returning (a following reload would
    // otherwise cancel the in-flight request — see addCustomHolding).
    const createPosted = this.page.waitForResponse(
      (r) =>
        /\/budgets\/[^/]+\/investments(\?.*)?$/.test(r.url()) &&
        r.request().method() === "POST",
      { timeout: 15000 },
    );
    await this.page.getByTestId("holding-sheet-submit").click();
    const res = await createPosted;
    if (!res.ok()) {
      throw new Error(
        `create savings POST failed: ${res.status()} ${res.url()}`,
      );
    }
  }

  /** Drag a holding row onto a group header (HTML5 DnD). */
  async dragIntoGroup(name: string, group: string): Promise<void> {
    await this.row(name).dragTo(this.groupHeader(group));
  }

  // ── Phase 13: type blocks (D-12) ──

  typeBlock(uiType: string) {
    return this.page.getByTestId(`investment-type-block-${uiType}`);
  }

  /** Block order as rendered, e.g. ["crypto", "other"]. */
  async typeBlockOrder(): Promise<string[]> {
    return this.page
      .locator('[data-testid^="investment-type-block-"]')
      .evaluateAll((els) =>
        els.map((e) =>
          (e.getAttribute("data-testid") ?? "").replace(
            "investment-type-block-",
            "",
          ),
        ),
      );
  }

  /** Drag block `a` above block `b` with real mouse input (PointerSensor needs
   *  primary-button pointer events; Playwright's mouse produces them). Resolves
   *  once the order write has been answered. */
  async dragTypeBlockAbove(a: string, b: string): Promise<void> {
    const grip = this.page.getByTestId(`drag-grip-type ${a}`);
    const g = (await grip.boundingBox())!;
    const target = (await this.typeBlock(b).boundingBox())!;
    const saved = this.page.waitForResponse(
      (r) =>
        r.url().includes("/investments/type-order") &&
        r.request().method() === "PUT",
    );
    await this.page.mouse.move(g.x + g.width / 2, g.y + g.height / 2);
    await this.page.mouse.down();
    await this.page.mouse.move(g.x + g.width / 2, target.y + 4, { steps: 20 });
    await this.page.mouse.up();
    const res = await saved;
    if (!res.ok()) throw new Error(`type-order PUT failed: ${res.status()}`);
  }

  // ── Phase 13: Sell (D-01) ──

  private wrapper(name: string) {
    return this.page.locator(
      `[data-investment-row-wrapper]:has([data-testid="holding-row-${name}"])`,
    );
  }

  /** Open the Sell sheet: swipe on a phone (touch pointer — the row ignores
   *  mouse pointers), hover + the row's Sell action on desktop. */
  async openSell(name: string): Promise<void> {
    const wrapper = this.wrapper(name);
    await wrapper.waitFor({ state: "visible" });
    const id = (await wrapper.getAttribute("data-investment-row-wrapper"))!;
    const width = this.page.viewportSize()?.width ?? 1280;
    if (width < 640) {
      await wrapper.evaluate((el: HTMLElement) => {
        const r = el.getBoundingClientRect();
        const y = r.top + r.height / 2;
        const x0 = r.right - 20;
        const fire = (type: string, x: number) =>
          el.dispatchEvent(
            new PointerEvent(type, {
              pointerId: 9002,
              pointerType: "touch",
              clientX: x,
              clientY: y,
              bubbles: true,
              cancelable: true,
            }),
          );
        fire("pointerdown", x0);
        fire("pointermove", x0 - 20);
        fire("pointermove", x0 - 220);
        return new Promise<void>((done) =>
          setTimeout(() => {
            fire("pointerup", x0 - 220);
            done();
          }, 80),
        );
      });
      await this.page.waitForTimeout(500); // ghost-click guard after pointerup
      await this.page.getByTestId(`investment-sell-${id}`).click();
    } else {
      await this.row(name).hover();
      await this.page.getByTestId(`investment-sell-desktop-${id}`).click();
    }
    await this.page.getByTestId("sell-sheet").waitFor({ state: "visible" });
  }

  /** Fill and submit the Sell sheet; resolves with the POST /sell status. */
  async sell(opts: {
    left: string;
    dest: "new" | "existing" | "out";
    received: string;
    existingName?: string;
    newName?: string;
  }): Promise<number> {
    const sheet = this.page.getByTestId("sell-sheet");
    await sheet.getByTestId("sell-left").fill(opts.left);
    await sheet.getByTestId(`sell-dest-${opts.dest}`).click();
    if (opts.dest === "new" && opts.newName)
      await sheet
        .getByTestId("holding-form-destination")
        .getByTestId("holding-sheet-name")
        .fill(opts.newName);
    if (opts.dest === "existing" && opts.existingName)
      await sheet.getByTestId("sell-existing").selectOption({
        value: (await sheet
          .getByTestId("sell-existing")
          .locator("option", { hasText: `${opts.existingName} ·` })
          .first()
          .getAttribute("value"))!,
      });
    await sheet.getByTestId("sell-received").fill(opts.received);
    const res = this.page.waitForResponse(
      (r) => r.url().endsWith("/sell") && r.request().method() === "POST",
    );
    await sheet.getByTestId("sell-submit").click();
    return (await res).status();
  }

  async assertSectionIsLast(): Promise<void> {
    const sections = this.page.locator('[data-testid^="wallet-section-"]');
    await expect(this.section()).toBeVisible();
    // Investments renders after every wallet-type section (INV-02).
    const lastWalletSection = sections.last();
    await expect(lastWalletSection).toBeVisible();
  }
}
