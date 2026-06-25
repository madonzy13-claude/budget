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

  // ── deterministic write barrier ──────────────────────────────────────────
  //
  // Optimistic UI gestures (inline-edit blur, Enter, switch toggle) return
  // BEFORE the server write commits. The golden walk then does a full page.goto
  // and reads a value derived from that write — intermittently reading the
  // pre-commit value under full-suite load. Each action below creates a
  // waitForResponse BEFORE the triggering gesture and awaits it AFTER, so the
  // gesture is only considered done once the server has RESPONDED (which it only
  // does after the write commits). All app writes go through the same-origin
  // `/api/*` Next.js rewrite, so match on pathname substring + method (robust to
  // the proxy prefix). `match` may be a substring (includes) or a predicate.
  private waitWrite(
    method: string,
    match: string | ((pathname: string) => boolean),
    timeout = 15000,
  ): Promise<unknown> {
    const test =
      typeof match === "function"
        ? match
        : (pathname: string) => pathname.includes(match);
    return this.page
      .waitForResponse(
        (r) => {
          if (r.request().method() !== method) return false;
          try {
            return test(new URL(r.url()).pathname);
          } catch {
            return false;
          }
        },
        { timeout },
      )
      .catch(() => undefined);
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
    // The wallet balance write is PATCH /api/wallets/:id. editAmount waits for
    // the cell's data-state, but the RESERVES total this feeds is a SEPARATE
    // query — wait for the wallet write's HTTP response (only returns post-commit)
    // before the caller navigates + reads the recomputed total.
    const resp = this.waitWrite("PATCH", (p) => /\/wallets\/[^/]+$/.test(p));
    await this.wallets.editAmount(walletId, major);
    await resp;
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
    // POST /api/budgets/:id/reserves/:categoryId/adjust — wait for the committed
    // response before the cover-dialog/return so the next read sees the adjust.
    const adjustResp = this.waitWrite("POST", "/adjust");
    await input.press("Enter");
    await adjustResp;
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
    // POST /api/budgets/:budgetId/transactions — await the committed create.
    const resp = this.waitWrite("POST", "/transactions");
    await input.press("Enter");
    await resp;
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
    // DELETE /api/budgets/:budgetId/transactions/:txId — fired by confirm; await
    // the committed response before returning.
    const resp = this.waitWrite("DELETE", "/transactions");
    await this.page.getByTestId("txn-row-delete-confirm").click();
    await resp;
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
    // PATCH /api/budgets/:budgetId/transactions/:txId — await the committed edit.
    const resp = this.waitWrite("PATCH", "/transactions");
    await input.press("Enter");
    await resp;
    return "spendings";
  }

  async setCushionMode(on: boolean): Promise<ActionTab> {
    await this.page.goto(`/en/budgets/${this.budgetId}/settings`);
    this.curView = null;
    await this.page
      .getByRole("button", { name: /cushion/i })
      .first()
      .click();
    // Every cushion write (master "Enable cushion" + per-month "Cushion mode")
    // is PATCH /api/budgets/:id on the budget itself. Match the budget-root path
    // exactly so it is NOT confused with PATCH /budgets/:id/transactions/:txId.
    const isBudgetRoot = (p: string) => p.endsWith(`/budgets/${this.budgetId}`);
    const mode = this.page.getByRole("switch", { name: "Cushion mode" });
    if (!(await mode.isVisible({ timeout: 2000 }).catch(() => false))) {
      // Master toggle fires PATCH { cushion_enabled: true }. Set the waiter
      // BEFORE the click, await it AFTER, so the master write is committed before
      // the per-month toggle below.
      const enableResp = this.waitWrite("PATCH", isBudgetRoot);
      await this.page.getByRole("switch", { name: "Enable cushion" }).click();
      await enableResp;
    }
    await mode.waitFor({ state: "visible", timeout: 8000 });
    const checked = (await mode.getAttribute("aria-checked")) === "true";
    if (checked !== on) {
      // aria-checked flips OPTIMISTICALLY — the cushion-mode PATCH (which drives
      // the reserve recompute) may still be in flight. Under full-suite load that
      // write can land AFTER the next assertReserves() navigation reads the page,
      // yielding a stale reserve value (flake seen only in the long run). Wait for
      // the actual PATCH /budgets/:id response — it returns only after the
      // recompute is persisted — instead of the racy "networkidle".
      const modeResp = this.waitWrite("PATCH", isBudgetRoot);
      await mode.click();
      await modeResp;
    }
    await expect(mode).toHaveAttribute("aria-checked", String(on), {
      timeout: 8000,
    });
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
