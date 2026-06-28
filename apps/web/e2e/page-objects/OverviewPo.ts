import type { Page } from "@playwright/test";
import { BdpPo } from "./BdpPo";

export type OverviewSectionSlug =
  | "planned"
  | "overspent"
  | "reserves"
  | "wealth";

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

  /** Planned-section category <select> (default "All categories"). */
  categorySelect() {
    return this.page.getByTestId("overview-planned-category");
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
}
