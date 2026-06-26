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
    // Arm the spendings-summary GET waiter BEFORE navigating. use-spendings-summary
    // is staleTime:0 + refetchOnMount:"always", so a background refetch ALWAYS lands
    // ~0.5s after mount and RE-RENDERS the grid. If a row gesture (dblclick to edit,
    // hover to delete) fires in that window the target row/cell DETACHES mid-gesture
    // → the inline-edit input never appears / the row "disappears" (the txn-row
    // interaction flake, ~1-2 in 3 under load). Awaiting the refetch response makes
    // the re-render happen BEFORE any gesture — mirrors gotoReserves' GET barrier.
    const summaryHydrated = this.waitWrite(
      "GET",
      (p) => p.includes("/spendings-summary"),
      20000,
    );
    await this.spendings.goto("en", this.budgetId, month);
    await summaryHydrated;
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
    // The reserve cells first paint at a "0" PLACEHOLDER: useReservesSummary has
    // no SSR initialData, so the persisted/empty React-Query cache renders every
    // per-category cell as "0". ~0.5s later the refetchOnMount:"always" GET
    // /budgets/:id/reserves lands and replaces them with real values. The footer
    // is already visible in that zero-shell, so waiting only on it lets a click
    // land on a placeholder cell — the InlineEditCell then seeds draft="0" and an
    // "adjust to 0" write silently no-ops on the equality guard (no POST).
    //
    // Arm the GET-list waiter BEFORE the goto so we catch the hydration response,
    // then await it: the per-category cells hold REAL values before any
    // interaction. Match method GET + pathname ENDING in /reserves (the list
    // endpoint) — this never matches POST /reserves/:categoryId/adjust (different
    // method AND the path ends in /adjust, not /reserves).
    const hydrated = this.page
      .waitForResponse(
        (r) => {
          if (r.request().method() !== "GET") return false;
          try {
            return new URL(r.url()).pathname.endsWith("/reserves");
          } catch {
            return false;
          }
        },
        { timeout: 20000 },
      )
      .catch(() => undefined);
    await this.page.goto(`/en/budgets/${this.budgetId}/reserves`);
    await hydrated;
    await expect(this.reserves.totalsFooter()).toBeVisible({ timeout: 20000 });
    this.curView = null;
  }

  // ── actions (return the tab they leave the user on) ──────────────────────────

  async setUserDefined(major: string): Promise<ActionTab> {
    // Arm the wallets-list GET waiter BEFORE navigating. useWallets has no
    // staleTime override (defaults 0 + refetchOnMount), so a GET /api/wallets
    // ALWAYS fires on mount and the rows render only once it lands. On a fresh
    // user (no persisted cache) under full-suite load that GET can take >15s to
    // paint the "Vault" row, so resolveIdByName timed out (the wallet-row flake,
    // 1-in-N). Await the GET so the list is rendered before we resolve the id —
    // mirrors gotoReserves' GET-hydration barrier. Method GET + pathname ending
    // /wallets never matches PATCH /wallets/:id or POST /wallets/reorder.
    const walletsHydrated = this.waitWrite(
      "GET",
      (p) => p.endsWith("/wallets"),
      20000,
    );
    await this.page.goto(`/en/budgets/${this.budgetId}/wallets`);
    await walletsHydrated;
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
    // gotoReserves() awaited the GET-hydration, so the cell shows its real
    // committed value (not the "0" placeholder). Open the editor and verify it
    // seeded from the SETTLED reserve value — retrying until the resting display
    // and the editor seed AGREE. Why a retry, not a one-shot guard: a cover-reveal
    // count-down (acknowledgeCover → ~700ms tween) drives a
    // displayReserveCentsOverride that shows the ANIMATING value while the editor
    // (InlineEditCell value = row.reserveCents, the not-yet-committed cache) still
    // reads the pre-commit number — so a click landing mid-animation seeds a stale
    // "0" under a real display, and a same-target adjust would no-op on the
    // InlineEditCell Object.is(draft,value) guard. Re-opening converges as the
    // animation commits the summary + clears the override on finish; this both
    // preserves the original guard's intent (never seed-then-no-op) and waits the
    // transient out instead of failing on it (a careful real user hits the same).
    const cellTestId = `reserves-balance-${id}`;
    const cell = this.page.getByTestId(cellTestId);
    const input = this.page
      .getByTestId(`${cellTestId}-editor`)
      .locator("input");
    await expect(async () => {
      // Return to the resting cell so a fresh beginEdit re-seeds from the CURRENT
      // (post-animation) props.value.
      if (await input.isVisible().catch(() => false)) {
        await this.page.keyboard.press("Escape");
        await expect(input).toBeHidden({ timeout: 2000 });
      }
      const display = (await cell.innerText()).trim();
      await cell.click();
      await expect(input).toBeVisible({ timeout: 2000 });
      const seeded = (await input.inputValue()).trim();
      if (display && display !== "0" && seeded === "0") {
        throw new Error(
          `reserves-balance-${id} editor seeded "0" while the cell shows "${display}" — cover-reveal/hydration transient; retry so "adjust to ${major}" is not a no-op.`,
        );
      }
    }).toPass({ timeout: 20000 });
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
    const del = row.getByTestId("txn-action-delete");
    // The transactions list (use-transactions) is a SEPARATE query from the
    // summary the gotoSpendings barrier awaits; it refetches + re-renders the row
    // ONCE ~0.5s after mount. A hover whose reveal is interrupted by that
    // re-render leaves the delete affordance hidden (the txn-row interaction
    // flake). Retry hover→reveal until the affordance is actually shown; the
    // refetch is one-time so this converges immediately once it settles.
    await expect(async () => {
      await row.hover();
      await expect(del).toBeVisible({ timeout: 2000 });
    }).toPass({ timeout: 15000 });
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
    const amountCell = row.locator("[data-amount-cell]");
    const input = row.locator("input");
    // The transactions list (use-transactions) is a SEPARATE query from the
    // summary the gotoSpendings barrier awaits; it refetches + re-renders the row
    // ONCE ~0.5s after mount. A dblclick that straddles that re-render (or whose
    // freshly-opened editor is swapped out by it) never leaves a usable inline
    // input — the editTxn flake (input never visible, 10s). Retry the dblclick
    // until the editor is actually open; the refetch is one-time so this
    // converges as soon as it settles, and the subsequent fill is then stable.
    await expect(async () => {
      await amountCell.dblclick();
      await expect(input).toBeVisible({ timeout: 2000 });
    }).toPass({ timeout: 15000 });
    await input.fill(toMajor);
    // PATCH /api/budgets/:budgetId/transactions/:txId — await the committed edit.
    const resp = this.waitWrite("PATCH", "/transactions");
    await input.press("Enter");
    await resp;
    return "spendings";
  }

  /** Read the budget's cushion flags from the SERVER (not the optimistic DOM).
   * GET /api/budgets/:id returns camelCase { cushionEnabled, cushionModeEnabled }
   * (budgets.ts / budget-identity.ts); useBudget unwraps json.budget ?? json. */
  private async serverCushionState(): Promise<{
    enabled: boolean;
    mode: boolean;
  }> {
    // X-Budget-ID is REQUIRED: the API scopes tenantIds from this header (the
    // app's clientApiFetch injects it on every call). Without it the budget GET
    // returns 404 not_found — the same header setLimit() already sends.
    const res = await this.page.request.get(`/api/budgets/${this.budgetId}`, {
      headers: { "X-Budget-ID": this.budgetId },
    });
    if (!res.ok()) {
      throw new Error(
        `GET /budgets/:id failed: ${res.status()} ${await res.text()}`,
      );
    }
    const json = (await res.json()) as Record<string, unknown>;
    const b = (json.budget ?? json) as Record<string, unknown>;
    return {
      enabled: b.cushionEnabled !== false, // default true (server default)
      mode: b.cushionModeEnabled === true, // default false
    };
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
    // 260625: decide every toggle from SERVER truth, not the DOM aria-checked.
    // The switch hydrates from the warm React-Query cache (a STALE snapshot) and
    // is corrected ~0.5s later by refetchOnMount. Reading aria-checked in that
    // window saw the stale value, judged the switch "already off", SKIPPED the
    // click → no PATCH → the reserve recompute never ran (the last golden flake,
    // trace-proven). The server row is authoritative the instant a prior PATCH
    // committed (each setCushionMode awaits its PATCH), so branch on it.
    let { enabled, mode } = await this.serverCushionState();
    const modeSwitch = this.page.getByRole("switch", { name: "Cushion mode" });
    if (!enabled) {
      // Master off → the "Cushion mode" switch is not rendered. Toggle the master
      // (PATCH { cushion_enabled: true }), await the committed write, then refetch
      // server truth so the mode decision below is based on the post-enable row.
      const enableResp = this.waitWrite("PATCH", isBudgetRoot);
      await this.page.getByRole("switch", { name: "Enable cushion" }).click();
      await enableResp;
      ({ enabled, mode } = await this.serverCushionState());
    }
    await modeSwitch.waitFor({ state: "visible", timeout: 8000 });
    if (mode !== on) {
      // aria-checked flips OPTIMISTICALLY — the cushion-mode PATCH (which drives
      // the reserve recompute) may still be in flight. Under full-suite load that
      // write can land AFTER the next assertReserves() navigation reads the page,
      // yielding a stale reserve value. Wait for the actual PATCH /budgets/:id
      // response — it returns only after the recompute is persisted.
      const modeResp = this.waitWrite("PATCH", isBudgetRoot);
      await modeSwitch.click();
      await modeResp;
    }
    // Now the switch must settle to the target. With cushion-section's prop-sync
    // effect (260625) the refetchOnMount GET reconciles the optimistic state to
    // the committed server value, so this asserts the SERVER outcome, not just the
    // optimistic flip.
    await expect(modeSwitch).toHaveAttribute("aria-checked", String(on), {
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
