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
 *   data-testid="investment-group-<type>"            a type block header
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

  /** Reveal a row action: swipe on a phone (touch pointer — the row ignores
   *  mouse pointers), hover on desktop. Returns the holding id. */
  private async rowAction(
    name: string,
    action: "sell" | "edit" | "delete",
  ): Promise<void> {
    const wrapper = this.wrapper(name);
    await wrapper.waitFor({ state: "visible" });
    const id = (await wrapper.getAttribute("data-investment-row-wrapper"))!;
    const width = this.page.viewportSize()?.width ?? 1280;
    if (width < 640) {
      // A freshly created row is re-keyed from its optimistic id to the server
      // id on refetch — retry the swipe until the action button takes the tap.
      await expect(async () => {
        const id = (await wrapper.getAttribute("data-investment-row-wrapper"))!;
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
        const tid =
          action === "sell"
            ? `investment-sell-${id}`
            : `holding-swipe-${action}-${id}`;
        await this.page.getByTestId(tid).click({ timeout: 3000 });
      }).toPass({ timeout: 20_000 });
      return;
    }
    if (action === "edit") {
      // Desktop: a row click opens the edit sheet.
      await this.row(name).click();
      return;
    }
    await this.row(name).hover();
    if (action === "sell")
      await this.page.getByTestId(`investment-sell-desktop-${id}`).click();
    else await this.wrapper(name).locator("[data-nav-delete]").click();
  }

  /** Open the Sell sheet for a holding. */
  async openSell(name: string): Promise<void> {
    await this.rowAction(name, "sell");
    await this.page.getByTestId("sell-sheet").waitFor({ state: "visible" });
  }

  /** Open the edit sheet for a holding. */
  async openEdit(name: string): Promise<void> {
    await this.rowAction(name, "edit");
    await this.sheet().waitFor({ state: "visible" });
  }

  /** Swipe/hover Delete; returns the confirm dialog. */
  async askDelete(name: string) {
    await this.rowAction(name, "delete");
    const dialog = this.page.getByRole("alertdialog");
    await dialog.waitFor({ state: "visible" });
    return dialog;
  }

  /** Save the edit sheet and wait for the booking (adjust) or PATCH. */
  async saveEdit(wait: "adjust" | "patch" | "none"): Promise<void> {
    const res =
      wait === "none"
        ? null
        : this.page.waitForResponse(
            (r) =>
              (wait === "adjust"
                ? r.url().endsWith("/adjust")
                : /\/investments\/[0-9a-f-]+$/.test(r.url())) &&
              ["POST", "PATCH"].includes(r.request().method()),
            { timeout: 15000 },
          );
    await this.page.getByTestId("holding-sheet-submit").click();
    if (res && !(await res).ok()) throw new Error("edit save failed");
  }

  /** Open the History section of the open edit sheet. */
  async openHistory() {
    const h = this.sheet().getByTestId("history-section");
    await h.waitFor({ state: "visible" });
    if ((await h.getAttribute("open")) === null)
      await h.locator("summary").click();
    return h;
  }

  /** Delete the newest history entry of a kind and wait for the undo. */
  async deleteHistoryEntry(kind: string): Promise<void> {
    const h = await this.openHistory();
    const row = h.locator(`[data-history-kind="${kind}"]`).first();
    await row.waitFor({ state: "visible" });
    await row.locator('[data-testid^="history-delete-"]').click();
    const undone = this.page.waitForResponse(
      (r) =>
        r.url().includes("/investments/history/") &&
        r.request().method() === "DELETE",
      { timeout: 15000 },
    );
    await this.page.getByTestId("history-delete-confirm").click();
    if (!(await undone).ok()) throw new Error("undo failed");
  }

  /** Add a broker holding with an opening date (deposited/current in major units). */
  async addBroker(
    name: string,
    deposited: string,
    current: string,
    date: string,
  ) {
    await this.addButton().click();
    await this.sheet().waitFor({ state: "visible" });
    const opt = this.page.getByTestId("holding-type-broker");
    if (!(await opt.isVisible().catch(() => false)))
      await this.page.getByTestId("holding-sheet-type").click();
    await opt.click();
    await this.page
      .getByTestId("holding-sheet-deposited")
      .waitFor({ state: "visible" });
    await this.page.getByTestId("holding-sheet-name").fill(name);
    await this.page.getByTestId("holding-sheet-deposited").fill(deposited);
    await this.page.getByTestId("holding-sheet-actual").fill(current);
    await this.page.getByTestId("holding-sheet-date").fill(date);
    const posted = this.page.waitForResponse(
      (r) =>
        /\/budgets\/[^/]+\/investments(\?.*)?$/.test(r.url()) &&
        r.request().method() === "POST",
      { timeout: 15000 },
    );
    await this.page.getByTestId("holding-sheet-submit").click();
    if (!(await posted).ok()) throw new Error("create broker failed");
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
