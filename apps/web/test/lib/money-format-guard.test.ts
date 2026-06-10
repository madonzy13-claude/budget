/**
 * money-format-guard.test.ts — repo guard against ad-hoc money formatting.
 *
 * Money shown to users must go through the shared compact formatters in
 * `src/lib/cents-format.ts` (`centsToDisplayCompact` with symbol, `centsToBare`
 * without) so the rule "drop a whole-unit .00, pad non-zero fractions to two
 * digits" holds everywhere. Hand-rolled `Intl.NumberFormat(..., {style:
 * "currency"})` always prints 2 decimals (e.g. €1,900.00) and is the recurring
 * source of UAT formatting complaints. This test fails CI if any component
 * reintroduces one outside the single allowed home (cents-format.ts).
 */
import { describe, it, expect } from "vitest";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { resolve, join } from "node:path";

// Vitest runs from apps/web; fall back to the monorepo-relative path so the
// guard also resolves when invoked from the repo root.
const SRC = [
  resolve(process.cwd(), "src"),
  resolve(process.cwd(), "apps/web/src"),
].find((p) => existsSync(p)) as string;

// The ONLY file allowed to construct a currency Intl.NumberFormat.
const ALLOWED_SUFFIXES = ["lib/cents-format.ts"];

// new Intl.NumberFormat( ... style: "currency" ... ) — tolerant of the options
// object spanning a few lines.
const CURRENCY_NUMBERFORMAT =
  /Intl\.NumberFormat\([\s\S]{0,240}?style:\s*["']currency["']/;

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) {
      out.push(...walk(p));
    } else if (/\.(ts|tsx)$/.test(entry) && !/\.test\.(ts|tsx)$/.test(entry)) {
      out.push(p);
    }
  }
  return out;
}

describe("money formatting guard", () => {
  it("no ad-hoc Intl.NumberFormat currency formatter outside cents-format.ts", () => {
    const offenders: string[] = [];
    for (const file of walk(SRC)) {
      if (ALLOWED_SUFFIXES.some((a) => file.endsWith(a))) continue;
      if (CURRENCY_NUMBERFORMAT.test(readFileSync(file, "utf8"))) {
        offenders.push(file.slice(file.indexOf("/src/") + 1));
      }
    }
    expect(
      offenders,
      `Use centsToDisplayCompact / centsToBare from lib/cents-format instead of a raw ` +
        `Intl.NumberFormat currency formatter (always prints .00):\n${offenders.join("\n")}`,
    ).toEqual([]);
  });
});
