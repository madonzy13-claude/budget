import type { Page } from "@playwright/test";
import { BdpPo } from "./BdpPo";

export type OverviewSectionSlug =
  "planned" | "overspent" | "reserves" | "wealth";

/**
 * OverviewPo — Page Object for the Budget Overview tab (Phase 11).
 *
 * Selectors are slug/testid-stable so a label or locale change never breaks
 * them (cards via BdpPo.overviewCard; sections via overview-section-<slug>;
 * range pills + wealth toggle by accessible name within their group).
 */
export class OverviewPo {
  readonly bdp: BdpPo;
  constructor(private page: Page) {
    this.bdp = new BdpPo(page);
  }

  /** Open the BDP and switch to the overview tab via the pill (client carousel). */
  async open(locale: string, budgetId: string) {
    await this.bdp.goto(locale, budgetId, "overview");
  }

  card(
    name:
      | "capitalization"
      | "available-to-spend"
      | "available-reserves"
      | "overspent"
      | "cushion",
  ) {
    return this.bdp.overviewCard(name);
  }

  /** The "Free to move" figure on the available-to-spend card — the money that
   *  can leave the budget today with every dip in the window still covered.
   *  Absent when there is nothing to move (the balanced note takes its place). */
  freeToMove() {
    return this.page.getByTestId("spend-surplus-deficit");
  }

  /** The four cards of the 2x2 grid, in DOM order. The capitalization hero
   *  above them is full-width and sits outside it. */
  gridCardNames() {
    return [
      "available-to-spend",
      "available-reserves",
      "overspent",
      "cushion",
    ] as const;
  }

  /** Their rendered heights, as the layout engine actually resolved them. */
  async gridCardHeights(): Promise<number[]> {
    const out: number[] = [];
    for (const name of this.gridCardNames()) {
      const box = await this.card(name).boundingBox();
      if (!box) throw new Error(`card not laid out: ${name}`);
      out.push(box.height);
    }
    return out;
  }

  rangeSelector() {
    return this.page.getByTestId("overview-range-selector");
  }

  /** A range preset pill by its visible label (e.g. "Month", "3M", "Year", "All"). */
  rangePill(label: string) {
    return this.rangeSelector().getByRole("button", {
      name: label,
      exact: true,
    });
  }

  section(slug: OverviewSectionSlug) {
    return this.page.getByTestId(`overview-section-${slug}`);
  }

  /** The header toggle button of a section. */
  sectionToggle(slug: OverviewSectionSlug) {
    return this.section(slug).getByRole("button").first();
  }

  /** The body that only mounts when a section is expanded. */
  sectionBody(slug: OverviewSectionSlug) {
    return this.page.getByTestId(`overview-section-${slug}-body`);
  }

  async expandSection(slug: OverviewSectionSlug) {
    if (
      (await this.sectionToggle(slug).getAttribute("aria-expanded")) !== "true"
    ) {
      await this.sectionToggle(slug).click();
    }
    await this.sectionBody(slug).waitFor({ state: "visible" });
  }

  /** Planned-section category picker (default "All categories").
   *  `.first()`: the section grew a second picker when the by-category chart
   *  got its own (260804), and both carry the same testid. */
  categorySelect() {
    return this.page.getByTestId("overview-planned-category").first();
  }

  /** An option inside the OPEN category picker popover. */
  categoryOption(name: string) {
    return this.page.getByRole("option", { name, exact: true });
  }

  /** Narrow the picker to ONE category: clear the default "everything", tick
   *  the one wanted, then close — closing is what commits the draft. */
  async pickOnlyCategory(name: string) {
    await this.categorySelect().click();
    await this.page.getByTestId("category-clear-all").click();
    await this.categoryOption(name).click();
    await this.page.keyboard.press("Escape");
  }

  /** A wealth view toggle button by its visible label (Capitalization / Investments). */
  wealthToggle(label: string) {
    return this.section("wealth").getByRole("button", {
      name: label,
      exact: true,
    });
  }

  /** The investments-view pie region (renders the pie or the calm empty-pie copy). */
  pieRegion() {
    return this.page.getByTestId("overview-wealth-pie");
  }

  // ── Reserve fit → rebalance dialog (260805) ───────────────────────────────

  /** The icon in the fit chart's LEFT corner that opens the rebalance dialog. */
  rebalanceTrigger() {
    return this.page.getByTestId("reserve-rebalance-open");
  }

  rebalanceDialog() {
    return this.page.getByTestId("reserve-rebalance-dialog");
  }

  /** A dialog row, addressed by the category NAME shown on it. */
  rebalanceRow(categoryName: string) {
    return this.rebalanceDialog()
      .getByRole("listitem")
      .filter({ hasText: categoryName });
  }

  /** That row's one button — Rebalance or Undo, carrying data-kind. */
  rebalanceAction(categoryName: string) {
    return this.rebalanceRow(categoryName).getByRole("button");
  }

  /** That row's editable target field. */
  rebalanceTarget(categoryName: string) {
    return this.rebalanceRow(categoryName).getByRole("textbox");
  }

  /** The reserves this dialog lists, top to bottom — the queue's order. */
  async rebalanceOrder(): Promise<string[]> {
    return await this.rebalanceDialog()
      .getByRole("listitem")
      .evaluateAll((els) =>
        els.map((el) => el.getAttribute("data-category") ?? ""),
      );
  }
}
