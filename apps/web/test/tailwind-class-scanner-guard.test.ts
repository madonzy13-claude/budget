import { describe, expect, test } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Tailwind scans SOURCE TEXT for class candidates. A class glued to a template
 * interpolation — `` `... md:w-[224px]${cond ? " ring-1" : ""}` `` — is not
 * extracted, so the utility never lands in the CSS bundle and the element
 * silently falls back to the previous breakpoint's width.
 *
 * That is exactly how the wallets-tab currency cell rendered 96px instead of
 * 224px on desktop (260812-dgf). Guard the whole tree: a className template
 * literal must put whitespace before `${`.
 */
const SRC = join(import.meta.dirname, "..", "src");

function tsxFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return tsxFiles(p);
    return e.isFile() && p.endsWith(".tsx") ? [p] : [];
  });
}

describe("Tailwind class extraction", () => {
  test("no className template literal glues a class to ${", () => {
    // `className={` … backtick … anything-but-backtick … non-space … `${`
    const glued = /className=\{`[^`]*[^\s`]\$\{/;
    const offenders = tsxFiles(SRC).filter((f) =>
      glued.test(readFileSync(f, "utf8")),
    );
    expect(offenders).toEqual([]);
  });
});
