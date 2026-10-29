import { expect, type Locator, type Page } from "@playwright/test";

const SCALE = 10n ** 8n;
/** Decimal string → integer × 1e8 (no float drift). */
function toScaled(v: string): bigint {
  const [i = "0", f = ""] = v.replace(/\s/g, "").replace(/,/g, ".").split(".");
  const neg = i.startsWith("-");
  const n =
    BigInt(i.replace("-", "") || "0") * SCALE +
    BigInt(f.padEnd(8, "0").slice(0, 8) || "0");
  return neg ? -n : n;
}
/** Integer × 1e8 → decimal string without trailing zeros. */
function fromScaled(n: bigint): string {
  const neg = n < 0n;
  const a = neg ? -n : n;
  const f = (a % SCALE).toString().padStart(8, "0").replace(/0+$/, "");
  return `${neg ? "-" : ""}${a / SCALE}${f ? `.${f}` : ""}`;
}
const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

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
 *
 * 13.1: rows are assets (Swap · Edit, tap opens the L3 ledger); the Swap sheet
 * replaces the Phase 13 Sell sheet and the slim Edit sheet replaces the edit
 * mode of the holding sheet.
 */
export class InvestmentsPo {
  constructor(private page: Page) {}

  section() {
    return this.page.getByTestId("investments-section");
  }

  addButton() {
    return this.page.getByTestId("add-investment-button");
  }

  /** "New transaction" opens on Buy with the Add form inside (round-2 gap 6). */
  async startBuy(): Promise<void> {
    await this.addButton().click();
    await expect(this.page.getByTestId("new-tx-kind-buy")).toHaveAttribute(
      "aria-checked",
      "true",
      { timeout: 5000 },
    );
  }

  /** "New transaction" → Sell / Transfer → type → asset → its Swap sheet. */
  async startFromNewTransaction(
    kind: "sell" | "transfer",
    type: string,
    name: string,
  ): Promise<void> {
    await this.addButton().click();
    await this.page.getByTestId(`new-tx-kind-${kind}`).click();
    // Round 3: Radix type list; the picked asset's form renders inside.
    await this.page.getByTestId("new-tx-type").click();
    await this.page.getByTestId(`new-tx-type-option-${type}`).click();
    // Round 4: a type's only asset is picked at once — pick by hand otherwise.
    const asset = this.page.getByTestId("new-tx-asset");
    await asset.waitFor({ state: "visible" });
    await this.page.waitForTimeout(200);
    if ((await asset.inputValue()) !== name) {
      await asset.click();
      await this.page
        .getByRole("listbox")
        .getByRole("option", { name, exact: true })
        .click();
    }
    await expect(
      this.page
        .getByTestId("new-tx-sheet")
        .getByTestId(kind === "sell" ? "swap-sell-sold" : "swap-transfer-qty"),
    ).toBeVisible({ timeout: 5000 });
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
    await this.startBuy();
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
    await this.startBuy();
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

  // ── 13.1: asset rows, Swap / Edit sheets, L3 ledger ──

  private wrapper(name: string) {
    return this.page.locator(
      `[data-investment-row-wrapper]:has([data-testid="holding-row-${name}"])`,
    );
  }

  async assetId(name: string): Promise<string> {
    const w = this.wrapper(name);
    await w.waitFor({ state: "visible" });
    return (await w.getAttribute("data-investment-row-wrapper"))!;
  }

  /** Reveal a row action: swipe on a phone (touch pointer — the row ignores
   *  mouse pointers), hover on desktop (D-05: Swap · Edit). */
  private async rowAction(
    name: string,
    action: "swap" | "edit" | "archive" | "delete",
  ): Promise<void> {
    const wrapper = this.wrapper(name);
    await wrapper.waitFor({ state: "visible" });
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
          action === "swap"
            ? `investment-swap-${id}`
            : action === "archive"
              ? `investment-archive-${id}`
              : action === "delete"
                ? `investment-delete-${id}`
                : `holding-swipe-edit-${id}`;
        await this.page.getByTestId(tid).click({ timeout: 3000 });
      }).toPass({ timeout: 20_000 });
      return;
    }
    const id = (await wrapper.getAttribute("data-investment-row-wrapper"))!;
    await this.row(name).hover();
    await this.page.getByTestId(`investment-${action}-desktop-${id}`).click();
  }

  swapSheet() {
    return this.page.getByTestId("swap-sheet");
  }

  /** Whichever sheet holds the Sell / Transfer form: the asset's Swap sheet
   *  or New transaction (round 3: the form renders inside it). */
  txForm() {
    return this.page.locator(
      '[data-testid="new-tx-sheet"]:visible, [data-testid="swap-sheet"]:visible',
    );
  }

  /** Open the Swap sheet on a tab (deposits have no tabs — Sell only). */
  async openSwap(
    name: string,
    tab: "buy" | "sell" | "transfer",
  ): Promise<void> {
    await this.rowAction(name, "swap");
    await this.swapSheet().waitFor({ state: "visible" });
    const t = this.page.getByTestId(`swap-tab-${tab}`);
    if (await t.isVisible().catch(() => false)) await t.click();
  }

  /** Open Add and pick a type (13.1 name-first form). */
  async openAdd(type: string): Promise<void> {
    await this.startBuy();
    await this.sheet().waitFor({ state: "visible" });
    const opt = this.page.getByTestId(`holding-type-${type}`);
    if (!(await opt.isVisible().catch(() => false)))
      await this.page.getByTestId("holding-sheet-type").click();
    await opt.click();
  }

  /** Focus the name field — the type's assets list without typing. */
  async focusName(): Promise<void> {
    await this.sheet().getByTestId("holding-sheet-name").click();
  }

  /** Pick an existing asset from the open name list. */
  async pickName(name: string): Promise<void> {
    const option = this.page
      .getByRole("option")
      .filter({ hasText: new RegExp(`^${name}`) });
    await expect(option).toHaveCount(1, { timeout: 5000 });
    await option.click();
  }

  /** Round 4: delete an asset that has nothing but its opening entry. */
  async deleteAsset(name: string): Promise<void> {
    await this.rowAction(name, "delete");
    const res = this.page.waitForResponse(
      (r) =>
        r.url().includes("/investments/entries/") &&
        r.request().method() === "DELETE",
      { timeout: 15000 },
    );
    await this.page.getByTestId("investment-delete-confirm").click();
    expect((await res).ok()).toBe(true);
  }

  /** Round 4: archive an asset through its row action + the confirm. */
  async archive(name: string): Promise<void> {
    await this.rowAction(name, "archive");
    const res = this.page.waitForResponse(
      (r) => r.url().endsWith("/archive") && r.request().method() === "POST",
      { timeout: 15000 },
    );
    await this.page.getByTestId("investment-archive-confirm").click();
    expect((await res).ok()).toBe(true);
  }

  /** Open the slim Edit sheet (D-06). */
  async openEdit(name: string): Promise<void> {
    await this.rowAction(name, "edit");
    await this.page
      .getByTestId("edit-asset-sheet")
      .waitFor({ state: "visible" });
  }

  /** Submit the Swap sheet; resolves with the status of the POST it sends. */
  async submitSwap(
    pathSuffix: "/buy" | "/sell" | "/transfer",
  ): Promise<number> {
    const res = this.page.waitForResponse(
      (r) => r.url().endsWith(pathSuffix) && r.request().method() === "POST",
      { timeout: 15000 },
    );
    await this.page.getByTestId("swap-submit").click();
    return (await res).status();
  }

  /** The sale asks what was SOLD (round-2 gap 9); scenarios still speak in
   *  "leaving X". Sell everything fills the holding; left "0" keeps it,
   *  otherwise the field gets held − left. */
  async fillSoldFromLeft(sheet: Locator, left: string): Promise<void> {
    // Round 3: tapping the held amount fills the field (no toggle).
    await sheet.getByTestId("swap-sell-held").click();
    const field = sheet.getByTestId("swap-sell-sold");
    await expect(field).not.toHaveValue("", { timeout: 5000 });
    if (left === "0") return;
    const held = toScaled(await field.inputValue());
    await field.fill(fromScaled(held - toScaled(left)));
  }

  /** Radix Select pickers (round-2 gap 7): open the trigger, pick
   *  "<name> · …" from the in-DOM list. */
  async pickOption(trigger: Locator, name: string): Promise<void> {
    await trigger.click();
    await this.page
      .getByRole("option", { name: new RegExp(`^${escapeRegExp(name)} ·`) })
      .click();
  }

  /** Touch-swipe an asset row left (phone), leaving its actions revealed. */
  async swipeAsset(name: string, px: number): Promise<void> {
    await this.wrapper(name).evaluate((el: HTMLElement, dx: number) => {
      const r = el.getBoundingClientRect();
      const y = r.top + Math.min(28, r.height / 2);
      const x0 = r.right - 20;
      const fire = (type: string, x: number) =>
        el.dispatchEvent(
          new PointerEvent(type, {
            pointerId: 9003,
            pointerType: "touch",
            clientX: x,
            clientY: y,
            bubbles: true,
            cancelable: true,
          }),
        );
      fire("pointerdown", x0);
      fire("pointermove", x0 - 20);
      fire("pointermove", x0 - dx);
      return new Promise<void>((done) =>
        setTimeout(() => {
          fire("pointerup", x0 - dx);
          done();
        }, 80),
      );
    }, px);
    await this.page.waitForTimeout(400); // 200ms settle transition
  }

  /** Fill the open Sell tab and submit it. Amount received is typed LAST:
   *  picking a destination or wallet re-prefills it. */
  async sell(opts: {
    left: string;
    dest: "new" | "existing" | "out";
    received: string;
    existingName?: string;
    newName?: string;
    wallet?:
      | { kind: "existing"; name: string }
      | { kind: "new"; name: string; type: string };
  }): Promise<number> {
    const sheet = this.swapSheet();
    await this.fillSoldFromLeft(sheet, opts.left);
    await sheet.getByTestId(`swap-dest-${opts.dest}`).click();
    if (opts.dest === "new" && opts.newName)
      await sheet
        .getByTestId("holding-form-destination")
        .getByTestId("holding-sheet-name")
        .fill(opts.newName);
    if (opts.dest === "existing" && opts.existingName)
      await this.pickOption(
        sheet.getByTestId("swap-sell-existing"),
        opts.existingName,
      );
    if (opts.wallet?.kind === "existing") {
      await sheet.getByTestId("wallet-target-existing").click();
      await this.pickOption(
        sheet.getByTestId("swap-wallet-select"),
        opts.wallet.name,
      );
    } else if (opts.wallet?.kind === "new") {
      await sheet.getByTestId("wallet-target-new").click();
      await sheet.getByTestId("swap-wallet-name").fill(opts.wallet.name);
      await sheet
        .getByTestId("swap-wallet-type")
        .selectOption(opts.wallet.type);
    }
    await sheet.getByTestId("swap-sell-received").fill(opts.received);
    return this.submitSwap("/sell");
  }

  /** Sell into a NEW crypto asset entered by hand (no catalog instrument,
   *  so no live feed): the Sell tab's own price field carries the price. */
  async startSellIntoNewCrypto(
    source: string,
    left: string,
    name: string,
    price: string,
  ): Promise<void> {
    await this.openSwap(source, "sell");
    const sheet = this.swapSheet();
    await this.fillSoldFromLeft(sheet, left);
    await sheet.getByTestId("swap-dest-new").click();
    const form = sheet.getByTestId("holding-form-destination");
    await form.getByTestId("holding-sheet-type").click();
    await this.page.getByTestId("holding-type-crypto").click();
    await form.getByTestId("holding-sheet-name").fill(name);
    await form.getByTestId("holding-sheet-instrument").fill("ZZQX9");
    await this.page
      .getByTestId("instrument-manual-entry-option")
      .click({ timeout: 10000 });
    await sheet.getByTestId("swap-dest-price").fill(price);
  }

  /** UAT 13.1 test 10: typing a quantity never moves the price. */
  async expectDestPriceStaysAfterQty(qty: string, price: string) {
    const sheet = this.swapSheet();
    await sheet.getByTestId("swap-dest-qty").fill(qty);
    await expect(sheet.getByTestId("swap-dest-price")).toHaveValue(price);
  }

  // ── L3 ledger (D-12..D-18) ──

  async ledger(name: string) {
    return this.page.getByTestId(`asset-ledger-${await this.assetId(name)}`);
  }

  /** Tap the asset open (stats + ledger strip) unless it already is. A just
   *  created row is re-keyed from its optimistic id to the server id on
   *  refetch, so the id is re-read on every attempt. */
  async openLedger(name: string) {
    let ledger = await this.ledger(name);
    await expect(async () => {
      ledger = await this.ledger(name);
      if (!(await ledger.isVisible().catch(() => false)))
        await this.row(name).locator('[data-testid^="asset-row-"]').click();
      await expect(ledger).toBeVisible({ timeout: 3000 });
      await expect(ledger.getByTestId("ledger-skeleton")).toHaveCount(0, {
        timeout: 5000,
      });
    }).toPass({ timeout: 30_000 });
    return ledger;
  }

  /** Phone widths hide a ledger row's delete until the row is swiped
   *  (13.1 UAT 12); desktop shows it in place. */
  async revealDelete(del: Locator): Promise<void> {
    if ((this.page.viewportSize()?.width ?? 1280) >= 640) return;
    const row = del.locator("xpath=ancestor::*[@data-ledger-row][1]");
    // Toasts from the previous write sit at the phone's bottom edge.
    await row.evaluate((el) => el.scrollIntoView({ block: "center" }));
    const box = (await row.boundingBox())!;
    const y = box.y + box.height / 2;
    const at = (x: number) => ({
      pointerType: "touch",
      pointerId: 9,
      clientX: x,
      clientY: y,
      bubbles: true,
    });
    const x0 = box.x + box.width - 20;
    for (const [type, x] of [
      ["pointerdown", x0],
      ["pointermove", x0 - 40],
      ["pointermove", x0 - 100],
      ["pointerup", x0 - 100],
    ] as const)
      await row.dispatchEvent(type, at(x), { timeout: 5000 });
    await expect(del).toHaveAttribute("data-open", "true", { timeout: 3000 });
  }

  /** Delete the asset's newest entry through the confirm dialog. The red
   *  (enabled) delete is the only deletable one (13.1 D-14). Phone widths
   *  reveal it with a touch swipe (13.1 UAT 12); desktop shows it in place. */
  async deleteNewestEntry(name: string): Promise<number> {
    const ledger = await this.openLedger(name);
    const del = ledger.locator(
      '[data-testid^="ledger-delete-"]:not([aria-disabled="true"])',
    );
    await expect(del).toHaveCount(1, { timeout: 5000 });
    await this.revealDelete(del);
    await del.click();
    const res = this.page.waitForResponse(
      (r) =>
        r.url().includes("/investments/entries/") &&
        r.request().method() === "DELETE",
      { timeout: 15000 },
    );
    await this.page.getByTestId("ledger-delete-confirm-action").click();
    return (await res).status();
  }

  /** Add a hand-priced quantity asset (manual type) through the Add sheet. */
  async addManual(opts: {
    type: string;
    name: string;
    qty: string;
    buy: string;
    current: string;
    pickExisting?: boolean;
  }) {
    await this.startBuy();
    await this.sheet().waitFor({ state: "visible" });
    const opt = this.page.getByTestId(`holding-type-${opts.type}`);
    if (!(await opt.isVisible().catch(() => false)))
      await this.page.getByTestId("holding-sheet-type").click();
    await opt.click();
    const name = this.page.getByTestId("holding-sheet-name");
    await name.waitFor({ state: "visible" });
    await name.fill(opts.name);
    if (opts.pickExisting) {
      await this.page.getByTestId("asset-name-option-0").click();
    }
    await this.page.getByTestId("holding-sheet-buy-price").fill(opts.buy);
    await this.page.getByTestId("holding-sheet-quantity").fill(opts.qty);
    await this.page.getByTestId("holding-sheet-amount").fill(opts.current);
    const posted = this.page.waitForResponse(
      (r) =>
        /\/budgets\/[^/]+\/investments(\?.*)?$/.test(r.url()) &&
        r.request().method() === "POST",
      { timeout: 15000 },
    );
    await this.page.getByTestId("holding-sheet-submit").click();
    const res = await posted;
    if (!res.ok()) throw new Error(`create asset POST failed: ${res.status()}`);
    return (await res.json()) as { id: string; joined: boolean };
  }

  /** Add a broker holding with an opening date (deposited/current in major units). */
  async addBroker(
    name: string,
    deposited: string,
    current: string,
    date: string,
  ) {
    await this.startBuy();
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

  /** Tap a type header's value to show its sum-up (D-26). */
  async typeSumUp(uiType: string) {
    const split = this.page.getByTestId(`investment-type-split-${uiType}`);
    if (!(await split.isVisible().catch(() => false)))
      await this.page.getByTestId(`investment-group-toggle-${uiType}`).click();
    await split.waitFor({ state: "visible" });
    return split;
  }

  async assertSectionIsLast(): Promise<void> {
    const sections = this.page.locator('[data-testid^="wallet-section-"]');
    await expect(this.section()).toBeVisible();
    // Investments renders after every wallet-type section (INV-02).
    const lastWalletSection = sections.last();
    await expect(lastWalletSection).toBeVisible();
  }
}
