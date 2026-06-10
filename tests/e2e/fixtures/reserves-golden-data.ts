/**
 * reserves-golden-data.ts — loads the canonical reserve golden table.
 *
 * SINGLE SOURCE OF TRUTH: this reads the EXACT same CSV the pure-engine golden
 * test asserts (packages/budgeting/test/domain/reserve-engine.golden.csv), so
 * the E2E and the unit test can never drift. The table is the user's submitted
 * golden table verbatim (2 categories — Grocery + Housing — June→July).
 *
 * Column order (header):
 *   action, month, G_limit, G_cushion, G_overspent, G_used, G_left,
 *   H_limit, H_cushion, H_overspent, H_used, H_left, G_reserve, H_reserve,
 *   internal, userDefined, surplus, cushion
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

export interface CatCells {
  /** normal monthly limit (major units, whole). */
  limit: string;
  /** cushion limit (major units). */
  cushion: string;
  /** overspent shown on the spendings grid (column-header-<cat>-overspent). */
  overspent: string;
  /** reserves used shown on the spendings grid (column-header-<cat>-reserves-used). */
  used: string;
  /** remaining/left shown on the spendings grid (column-header-<cat>-balance). */
  left: string;
  /** available reserve shown on the reserves tab (reserves-balance-<id>). */
  reserve: string;
}

export interface GoldenRow {
  action: string;
  /** 'YYYY-MM' the action was performed in (adjust asOf; "now" for added txns). */
  when: string;
  /** 'YYYY-MM' currently displayed → which (category, month) cell the row asserts. */
  view: string;
  G: CatCells;
  H: CatCells;
  /** Σ available reserve → reserves footer TOTAL AVAILABLE. */
  internal: string;
  /** Σ RESERVE-wallet balances → reserves footer TOTAL IN WALLETS. */
  userDefined: string;
  /** userDefined − internal (not shown in UI; locked by the engine golden). */
  surplus: string;
  cushion: "on" | "off";
}

const here = dirname(fileURLToPath(import.meta.url));
// tests/e2e/fixtures → repo root → packages/budgeting/test/domain/…
const CSV_PATH = join(
  here,
  "../../../packages/budgeting/test/domain/reserve-engine.golden.csv",
);

export function loadGoldenRows(): GoldenRow[] {
  const raw = readFileSync(CSV_PATH, "utf8");
  const lines = raw
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  return lines.slice(1).map((line) => {
    const v = line.split(",");
    return {
      action: v[0],
      when: v[1],
      view: v[2],
      G: {
        limit: v[3],
        cushion: v[4],
        overspent: v[5],
        used: v[6],
        left: v[7],
        reserve: v[13],
      },
      H: {
        limit: v[8],
        cushion: v[9],
        overspent: v[10],
        used: v[11],
        left: v[12],
        reserve: v[14],
      },
      internal: v[15],
      userDefined: v[16],
      surplus: v[17],
      cushion: v[18] as "on" | "off",
    };
  });
}

/**
 * Format a whole major-unit string the way the UI renders it (centsToBare with
 * en-US grouping): 1200 → "1,200", 300 → "300", 0 → "0".
 */
export function fmtMajor(major: string): string {
  return new Intl.NumberFormat("en-US").format(Number(major));
}

/**
 * The golden CSV labels its two months 2026-06 (first) and 2026-07 (second). The
 * full-clock E2E maps them onto REAL months one earlier — first → 2026-05 (May,
 * the past month), second → 2026-06 (June, the real current month) — so the gated
 * test clock only has to move backward (to May) for the first phase, and the
 * second phase runs on the real wall clock.
 */
export function realMonth(csvMonth: string): string {
  return csvMonth === "2026-07" ? "2026-06" : "2026-05";
}
