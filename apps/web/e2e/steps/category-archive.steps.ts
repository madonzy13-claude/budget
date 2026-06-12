import { createBdd } from "playwright-bdd";
import { expect } from "@playwright/test";
import { test } from "../fixtures/fresh-user-per-scenario";
import { SpendingsPo } from "../page-objects/SpendingsPo";

const { When, Then } = createBdd(test);

// ─── Archive (keep history) via the category edit slider ────────────────────

When(
  /^I archive the "(.+?)" category keeping history$/,
  async ({ page }, categoryName: string) => {
    const po = new SpendingsPo(page);
    const header = po.columnHeader(categoryName);
    await expect(header).toBeVisible({ timeout: 10000 });
    // Hovering anywhere in the header reveals the action cluster (group-hover,
    // 260611-vuo) regardless of the tap-reveal toggle state — deterministic on
    // both the chromium and mobile (mouse-driven) projects.
    await header.hover();
    await po.columnPen(categoryName).click();
    await expect(po.catSliderContent()).toBeVisible({ timeout: 8000 });
    await po.catSliderDelete().click();
    await po.catRemoveKeepHistory().click();
    // Slider + remove dialog close on success; router.refresh() then lands the
    // archived summary flag (asserted by the archived-label Then step).
    await expect(po.catSliderContent()).toBeHidden({ timeout: 10000 });
  },
);

// ─── Archived-label assertions ───────────────────────────────────────────────

Then(
  /^the "(.+?)" column shows the archived label$/,
  async ({ page }, categoryName: string) => {
    const po = new SpendingsPo(page);
    await expect(po.columnArchivedLabel(categoryName)).toBeVisible({
      timeout: 10000,
    });
  },
);

Then(
  /^the "(.+?)" column does not show the archived label$/,
  async ({ page }, categoryName: string) => {
    const po = new SpendingsPo(page);
    // The column itself must exist — "label absent because the whole column
    // vanished" must fail this step, not pass it.
    await expect(po.columnHeader(categoryName)).toBeVisible({ timeout: 10000 });
    await expect(po.columnArchivedLabel(categoryName)).toHaveCount(0, {
      timeout: 10000,
    });
  },
);

// ─── Revert (unarchive) — Undo2 icon, NO confirm dialog ─────────────────────

When(
  /^I click the revert icon on the "(.+?)" column$/,
  async ({ page }, categoryName: string) => {
    const po = new SpendingsPo(page);
    await po.columnHeader(categoryName).hover();
    await po.columnRevert(categoryName).click();
  },
);

Then(
  /^the edit pen is available on the "(.+?)" column$/,
  async ({ page }, categoryName: string) => {
    const po = new SpendingsPo(page);
    // Reverted column is a normal editable column again: pen rendered,
    // archived-only revert/trash gone. (The pen sits at opacity-0 until
    // revealed, so assert attachment — Playwright treats opacity-0 as
    // "visible", making toBeVisible meaningless here.)
    await expect(po.columnPen(categoryName)).toBeAttached({ timeout: 10000 });
    await expect(po.columnRevert(categoryName)).toHaveCount(0);
    await expect(po.columnTrash(categoryName)).toHaveCount(0);
  },
);

// ─── Permanent delete — archived column trash → confirm dialog ──────────────

When(
  /^I click the trash icon on the "(.+?)" column$/,
  async ({ page }, categoryName: string) => {
    const po = new SpendingsPo(page);
    await po.columnHeader(categoryName).hover();
    await po.columnTrash(categoryName).click();
  },
);

Then(
  "the category permanent-delete confirm dialog is visible",
  async ({ page }) => {
    const po = new SpendingsPo(page);
    await expect(po.categoryDeleteDialog()).toBeVisible({ timeout: 5000 });
  },
);

When("I confirm the permanent category delete", async ({ page }) => {
  const po = new SpendingsPo(page);
  await po.categoryDeleteConfirm().click();
});

Then(
  /^the "(.+?)" column is removed from the grid$/,
  async ({ page }, categoryName: string) => {
    const po = new SpendingsPo(page);
    await expect(po.columnHeader(categoryName)).toHaveCount(0, {
      timeout: 10000,
    });
    await expect(po.categoryDeleteDialog()).toBeHidden({ timeout: 5000 });
  },
);

// ─── Action reveal via a NON-name header row cell (260611-vuo FEATURE3) ─────
// The action cluster hides at opacity-0 + pointer-events-none and shows at
// opacity-1. Playwright's toBeVisible() ignores opacity, so reveal state is
// asserted via computed CSS opacity.

Then(
  /^the edit pen on the "(.+?)" column is concealed$/,
  async ({ page }, categoryName: string) => {
    const po = new SpendingsPo(page);
    // No prior pointer interaction in the scenario: mouse is parked at (0,0),
    // so neither tap-reveal nor group-hover is engaged.
    await expect(po.columnPen(categoryName)).toHaveCSS("opacity", "0", {
      timeout: 10000,
    });
  },
);

When(
  /^I click the planned row cell on the "(.+?)" column$/,
  async ({ page }, categoryName: string) => {
    const po = new SpendingsPo(page);
    await po.columnPlannedCell(categoryName).click();
    // Park the mouse away from the column so the subsequent reveal assertion
    // proves CLICK-reveal (revealed state), not hover-reveal (group-hover).
    await page.mouse.move(0, 0);
  },
);

Then(
  /^the edit pen on the "(.+?)" column is revealed$/,
  async ({ page }, categoryName: string) => {
    const po = new SpendingsPo(page);
    await expect(po.columnPen(categoryName)).toHaveCSS("opacity", "1", {
      timeout: 5000,
    });
  },
);

Then(
  /^the revert icon on the "(.+?)" column is revealed$/,
  async ({ page }, categoryName: string) => {
    const po = new SpendingsPo(page);
    await expect(po.columnRevert(categoryName)).toHaveCSS("opacity", "1", {
      timeout: 5000,
    });
  },
);

Then(
  /^the trash icon on the "(.+?)" column is revealed$/,
  async ({ page }, categoryName: string) => {
    const po = new SpendingsPo(page);
    await expect(po.columnTrash(categoryName)).toHaveCSS("opacity", "1", {
      timeout: 5000,
    });
  },
);

// ─── Header content assertions ───────────────────────────────────────────────

Then(
  /^the "(.+?)" column shows a planned amount of "(.+?)"$/,
  async ({ page }, categoryName: string, bareAmount: string) => {
    const po = new SpendingsPo(page);
    await expect(po.columnPlannedAmount(categoryName, bareAmount)).toBeVisible({
      timeout: 10000,
    });
  },
);

Then(
  /^the "(.+?)" column shows its full name without truncation$/,
  async ({ page }, categoryName: string) => {
    const po = new SpendingsPo(page);
    const span = po.columnNameSpan(categoryName);
    await expect(span).toHaveText(categoryName, { timeout: 10000 });
    // 260611-vuo BUG1 regression guard: the action cluster is an absolute
    // overlay, so the name span gets the full row width and must not be
    // ellipsis-truncated when the name fits the column.
    const truncated = await span.evaluate(
      (el) => el.scrollWidth > el.clientWidth,
    );
    if (truncated) {
      throw new Error(
        `Expected "${categoryName}" name span to render untruncated, but scrollWidth exceeds clientWidth`,
      );
    }
  },
);
