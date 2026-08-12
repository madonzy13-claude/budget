/**
 * sheet-single-scroll.test.ts — every form sheet scrolls AS ONE (260731).
 *
 * User decision: no pinned header/footer inside these popups — scrolling moves
 * the title and the action buttons with the content. That means exactly one
 * scroll container: the SheetContent itself. An inner `flex-1 … overflow-y-auto`
 * body re-pins the header/footer, so it must not come back.
 *
 * Source-level check on purpose: the contract is a layout class combination on
 * a Radix portal, and asserting it here catches a regression in every sheet at
 * once without five bespoke render harnesses.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const SHEETS = [
  "src/components/budgeting/income-form.tsx",
  "src/components/budgeting/scheduled-payment-form.tsx",
  "src/components/budgeting/wallets-tab/holding-sheet.tsx",
  "src/components/budgeting/category-slider.tsx",
  "src/components/budgeting/transaction-slider.tsx",
];

/** First className= after the <SheetContent tag (props may sit behind comments). */
function sheetContentClassName(src: string): string {
  const at = src.indexOf("<SheetContent");
  expect(at).toBeGreaterThan(-1);
  const m = src.slice(at).match(/className="([^"]*)"/);
  return m?.[1] ?? "";
}

describe("Form sheets scroll as a single surface", () => {
  for (const rel of SHEETS) {
    const src = readFileSync(resolve(__dirname, "../..", rel), "utf8");

    it(`${rel}: SheetContent owns the scroll`, () => {
      expect(sheetContentClassName(src)).toContain("overflow-y-auto");
    });

    it(`${rel}: has no inner scroll container pinning header/footer`, () => {
      expect(src).not.toMatch(/flex-1[^"]*overflow-y-auto/);
      expect(src).not.toMatch(/overflow-y-auto[^"]*flex-1/);
    });
  }
});
