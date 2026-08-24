import { type Page, expect } from "@playwright/test";

export class ProjectionTimelinePo {
  constructor(private page: Page) {}

  banner() {
    return this.page.getByTestId("projection-timeline");
  }

  async expectVisible() {
    await expect(this.banner()).toBeVisible();
  }

  dayCells() {
    return this.page.getByTestId("projection-day");
  }

  async expectAtLeastDays(n: number) {
    const count = await this.dayCells().count();
    expect(count).toBeGreaterThanOrEqual(n);
  }

  async hoverLastDay() {
    const cells = this.dayCells();
    const count = await cells.count();
    await cells.nth(count - 1).hover();
  }

  async expectTooltip() {
    await expect(this.page.getByTestId("projection-tooltip")).toBeVisible();
  }

  /**
   * Every month name printed on the strip keeps clear air around it: a gap to
   * the dashed rule of the month that follows, and a gap to the strip's own
   * rounded end for the last one.
   *
   * This is the assertion the unit tests cannot make. `MIN_LABEL_PCT` decides
   * whether to print a name by predicting how much room the glyphs will need,
   * and happy-dom lays out nothing — every box there is 0×0, so a prediction
   * that is 1px short reads as green. Only a real engine can say the label and
   * the rule actually collided (user, 260824 — "Aug" flush against the Sep
   * rule, the guard having cleared it by 0.08%).
   *
   * Divider positions come from the rules' `x1` percentage rather than their
   * bounding boxes: an SVG <line> is zero-width, and its box is not a reliable
   * way to ask where it sits.
   */
  async expectMonthLabelsClearDividers(minGapPx = 4) {
    const strip = await this.page.getByTestId("projection-line").boundingBox();
    expect(strip, "projection strip has no box").not.toBeNull();
    const { x: stripX, width: stripW } = strip!;

    const rules = await this.page
      .getByTestId("projection-month-rule")
      .evaluateAll((els) =>
        els.map((el) => parseFloat(el.getAttribute("x1") ?? "0")),
      );
    // Numeric sort — the default one is lexicographic, which puts 100 before 20.
    const ruleXs = rules
      .map((pct) => stripX + (pct / 100) * stripW)
      .sort((a, b) => a - b);

    const labels = this.page.getByTestId("projection-month");
    const count = await labels.count();
    expect(count, "no month labels on the strip").toBeGreaterThan(0);

    for (let i = 0; i < count; i++) {
      const label = labels.nth(i);
      const text = (await label.textContent())?.trim();
      const box = (await label.boundingBox())!;
      const right = box.x + box.width;

      // Clear of the strip's left end (the opening label's lead-in).
      expect(box.x - stripX, `"${text}" crowds the start of the strip`)
        .toBeGreaterThanOrEqual(minGapPx);

      // Clear of the next month's rule, if this is not the last segment.
      // Searched from the label's LEFT edge, not its right: a label that has
      // already overrun its divider would otherwise skip past it to the next
      // one and measure a comfortable gap to the wrong rule — which is exactly
      // how this assertion first passed against the very build it was written
      // to fail. Every label starts a few px AFTER its own rule, so the first
      // rule right of box.x is always the one it must not reach.
      const nextRule = ruleXs.find((x) => x > box.x);
      if (nextRule !== undefined) {
        expect(nextRule - right, `"${text}" collides with the next divider`)
          .toBeGreaterThanOrEqual(minGapPx);
      }

      // …and of the strip's right end regardless.
      expect(stripX + stripW - right, `"${text}" runs off the strip`)
        .toBeGreaterThanOrEqual(minGapPx);
    }
  }
}
