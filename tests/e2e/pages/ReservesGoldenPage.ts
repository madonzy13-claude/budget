/**
 * ReservesGoldenPage.ts — driver for the FULL reserve golden-table E2E walk.
 *
 * Drives every golden row through the real UI across TWO real months (May→June)
 * using the gated server test clock (POST/DELETE /api/test/clock). Each row's
 * `when` selects the clock month; its `view` selects which month's spendings grid
 * to read. Reserve adjusts / cushion toggles / limit changes are pinned to the
 * server clock, so moving the clock to May lets the May-section rows be driven
 * with real gestures; the June section runs on the real wall clock.
 *
 * Per-category snapshot read from the DOM:
 *   - spendings grid (for the viewed month): overspent / reserves-used / left
 *   - reserves tab: available reserve per category + TOTAL AVAILABLE / IN WALLETS
 *
 * Never waits for "networkidle" (the app holds open connections); waits on
 * concrete elements + retries via toHaveText.
 */
import { type Page, expect } from "@playwright/test";
import { SpendingsPage } from "./SpendingsPage.js";
import { ReservesPage } from "./ReservesPage.js";
import { WalletsPage } from "./WalletsPage.js";
import { fmtMajor, type GoldenRow } from "../fixtures/reserves-golden-data.js";

export type ActionTab = "spendings" | "reserves" | "other";

const RESERVE_WALLET = "Vault";

export class ReservesGoldenPage {
  readonly spendings: SpendingsPage;
  readonly reserves: ReservesPage;
  readonly wallets: WalletsPage;

  private ids: Record<string, string> = {};
  /** Month currently shown on the spendings grid (null when on another tab). */
  private curView: string | null = null;

  constructor(
    private readonly page: Page,
    private readonly budgetId: string,
  ) {
    this.spendings = new SpendingsPage(page);
    this.reserves = new ReservesPage(page);
    this.wallets = new WalletsPage(page);
  }

  // ── gated test clock ───────────────────────────────────────────────────────

  async setClock(month: string): Promise<void> {
    const res = await this.page.request.post("/api/test/clock", {
      data: { now: `${month}-15T12:00:00.000Z` },
    });
    if (!res.ok()) {
      throw new Error(
        `set test clock failed: ${res.status()} ${await res.text()}`,
      );
    }
  }

  async clearClock(): Promise<void> {
    await this.page.request.delete("/api/test/clock").catch(() => {});
  }

  // ── id resolution ────────────────────────────────────────────────────────

  async resolveIds(names: string[]): Promise<void> {
    await this.gotoReserves();
    for (const name of names) {
      this.ids[name] = await this.reserves.resolveCategoryIdByName(name);
    }
  }

  private idOf(name: string): string {
    const id = this.ids[name];
    if (!id) throw new Error(`category id not resolved for "${name}"`);
    return id;
  }

  // ── navigation ─────────────────────────────────────────────────────────────

  async gotoSpendings(month: string): Promise<void> {
    await this.spendings.goto("en", this.budgetId, month);
    await expect(this.spendings.gridContainer()).toBeVisible({
      timeout: 20000,
    });
    this.curView = month;
  }

  /** Ensure the spendings grid shows `month`; no reload if already there (keeps a live read). */
  async ensureSpendings(month: string): Promise<void> {
    if (this.curView !== month) await this.gotoSpendings(month);
  }

  async gotoReserves(): Promise<void> {
    await this.page.goto(`/en/budgets/${this.budgetId}/reserves`);
    await expect(this.reserves.totalsFooter()).toBeVisible({ timeout: 20000 });
    this.curView = null;
  }

  // ── actions (return the tab they leave the user on) ──────────────────────────

  async setUserDefined(major: string): Promise<ActionTab> {
    await this.page.goto(`/en/budgets/${this.budgetId}/wallets`);
    this.curView = null;
    const walletId = await this.wallets.resolveIdByName(RESERVE_WALLET);
    await this.wallets.editAmount(walletId, major);
    return "other";
  }

  async adjustReserve(
    catName: string,
    major: string,
    expectCover: boolean,
  ): Promise<ActionTab> {
    await this.gotoReserves();
    const id = this.idOf(catName);
    await this.page.getByTestId(`reserves-balance-${id}`).click();
    const input = this.page
      .getByTestId(`reserves-balance-${id}-editor`)
      .locator("input");
    await input.waitFor({ state: "visible", timeout: 10000 });
    await input.fill(major);
    await input.press("Enter");
    if (expectCover) {
      const dialog = this.page.getByTestId("reserve-cover-dialog");
      await expect(dialog).toBeVisible({ timeout: 10000 });
      await this.page.getByTestId("reserve-cover-ack").click();
      await expect(dialog).toBeHidden({ timeout: 8000 });
    }
    return "reserves";
  }

  async addTxn(
    catName: string,
    major: string,
    viewMonth: string,
  ): Promise<ActionTab> {
    await this.gotoSpendings(viewMonth);
    const input = this.spendings.quickEntryInput(catName);
    await input.waitFor({ state: "visible", timeout: 10000 });
    await input.fill(major);
    await input.press("Enter");
    return "spendings";
  }

  async removeTxn(
    catName: string,
    major: string,
    viewMonth: string,
  ): Promise<ActionTab> {
    await this.gotoSpendings(viewMonth);
    const row = this.txnRow(catName, major);
    await row.waitFor({ state: "visible", timeout: 10000 });
    await row.hover();
    const del = row.getByTestId("txn-action-delete");
    await del.waitFor({ state: "visible", timeout: 5000 });
    await del.click();
    await this.page.getByTestId("txn-row-delete-confirm").click();
    return "spendings";
  }

  async editTxn(
    catName: string,
    fromMajor: string,
    toMajor: string,
    viewMonth: string,
  ): Promise<ActionTab> {
    await this.gotoSpendings(viewMonth);
    const row = this.txnRow(catName, fromMajor);
    await row.waitFor({ state: "visible", timeout: 10000 });
    await row.locator("[data-amount-cell]").dblclick();
    const input = row.locator("input");
    await input.waitFor({ state: "visible", timeout: 10000 });
    await input.fill(toMajor);
    await input.press("Enter");
    return "spendings";
  }

  async setCushionMode(on: boolean): Promise<ActionTab> {
    await this.page.goto(`/en/budgets/${this.budgetId}/settings`);
    this.curView = null;
    await this.page
      .getByRole("button", { name: /cushion/i })
      .first()
      .click();
    const mode = this.page.getByRole("switch", { name: "Cushion mode" });
    if (!(await mode.isVisible({ timeout: 2000 }).catch(() => false))) {
      await this.page.getByRole("switch", { name: "Enable cushion" }).click();
    }
    await mode.waitFor({ state: "visible", timeout: 8000 });
    const checked = (await mode.getAttribute("aria-checked")) === "true";
    if (checked !== on) await mode.click();
    await expect(mode).toHaveAttribute("aria-checked", String(on), {
      timeout: 8000,
    });
    // aria-checked flips OPTIMISTICALLY — the cushion-mode PATCH (which drives the
    // reserve recompute) may still be in flight. Under full-suite load that write
    // can land AFTER the next assertReserves() navigation reads the page, yielding
    // a stale reserve value (flake seen only in the long run, never in isolation).
    // Wait for the network to settle so the recompute is persisted before the read.
    await this.page.waitForLoadState("networkidle");
    return "other";
  }

  /**
   * "<cat> limit A to B" → POST a new limit. effectiveFrom is the month start of
   * the month the change was made in (carries forward), so it lands in May when
   * the clock is in May.
   */
  async setLimit(
    catName: string,
    normalMajor: string,
    cushionMajor: string,
    effFromMonth: string,
  ): Promise<ActionTab> {
    const id = this.idOf(catName);
    const res = await this.page.request.post(`/api/categories/${id}/limits`, {
      headers: {
        "Idempotency-Key": crypto.randomUUID(),
        "X-Budget-ID": this.budgetId,
      },
      data: {
        normalAmount: String(Math.round(Number(normalMajor) * 100)),
        cushionAmount: String(Math.round(Number(cushionMajor) * 100)),
        normalCurrency: "EUR",
        effectiveFrom: `${effFromMonth}-01`,
      },
    });
    if (![200, 201, 409].includes(res.status())) {
      throw new Error(
        `POST /limits failed: ${res.status()} ${await res.text()}`,
      );
    }
    this.curView = null; // force a fresh grid read on the next assert
    return "spendings";
  }

  // ── helpers ──────────────────────────────────────────────────────────────

  private txnRow(catName: string, major: string) {
    const cents = String(Math.round(Number(major) * 100));
    return this.page
      .getByTestId(`category-column-${this.idOf(catName)}`)
      .getByTestId(`txn-row-${cents}`)
      .first();
  }

  // ── assertions ───────────────────────────────────────────────────────────

  /** Assert the spendings grid cells for both categories in the VIEWED month. */
  async assertSpendings(row: GoldenRow, viewMonth: string): Promise<void> {
    await this.ensureSpendings(viewMonth);
    for (const [name, cells] of [
      ["Grocery", row.G],
      ["Housing", row.H],
    ] as const) {
      const where = `[${row.action} | view ${viewMonth}] ${name}`;
      await expect(
        this.spendings.columnHeaderRow(name, "overspent"),
        `${where} overspent`,
      ).toHaveText(fmtMajor(cells.overspent), { timeout: 10000 });
      await expect(
        this.spendings.columnHeaderRow(name, "reserves-used"),
        `${where} reserves-used`,
      ).toHaveText(fmtMajor(cells.used), { timeout: 10000 });
      await expect(
        this.spendings.columnHeaderRow(name, "balance"),
        `${where} balance/left`,
      ).toHaveText(fmtMajor(cells.left), { timeout: 10000 });
    }
  }

  /** Assert the reserves tab cells + footer totals (category-level, clock-derived). */
  async assertReserves(row: GoldenRow): Promise<void> {
    await this.gotoReserves();
    await expect(
      this.reserves.balanceCell(this.idOf("Grocery")),
      `[${row.action}] Grocery reserve`,
    ).toHaveText(fmtMajor(row.G.reserve), { timeout: 10000 });
    await expect(
      this.reserves.balanceCell(this.idOf("Housing")),
      `[${row.action}] Housing reserve`,
    ).toHaveText(fmtMajor(row.H.reserve), { timeout: 10000 });
    await expect(
      this.page.getByTestId("reserves-total-available"),
      `[${row.action}] TOTAL AVAILABLE (internal)`,
    ).toHaveText(`${fmtMajor(row.internal)} EUR`, { timeout: 10000 });
    await expect(
      this.page.getByTestId("reserves-total-wallets"),
      `[${row.action}] TOTAL IN WALLETS (userDefined)`,
    ).toHaveText(`${fmtMajor(row.userDefined)} EUR`, { timeout: 10000 });
  }
}
